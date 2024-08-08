import {
  generateDependencyImports,
  GenerateMockImports,
  GeneratorDependency,
  GeneratorImport,
  GeneratorOptions,
  GeneratorVerbOptions,
  isFunction,
  isObject,
  pascal,
  ResReqTypesValue,
} from '@vetster/orval-core';
import { getRouteMSW, overrideVarName } from '../faker/getters';
import { getMockDefinition, getMockOptionsDataOverride } from './mocks';
import { getDelay } from '../delay';

const getMSWDependencies = (locale?: string): GeneratorDependency[] => [
  {
    exports: [
      { name: 'http', values: true },
      { name: 'HttpResponse', values: true },
      { name: 'delay', values: true },
    ],
    dependency: 'msw',
  },
  {
    exports: [{ name: 'faker', values: true }],
    dependency: locale ? `@faker-js/faker/locale/${locale}` : '@faker-js/faker',
  },
];

export const generateMSWImports: GenerateMockImports = ({
  implementation,
  imports,
  specsName,
  hasSchemaDir,
  isAllowSyntheticDefaultImports,
  options,
}) => {
  return generateDependencyImports(
    implementation,
    [
      ...getMSWDependencies(options?.locale),
      ...(options?.dependencies || []),
      ...imports,
    ],
    specsName,
    hasSchemaDir,
    isAllowSyntheticDefaultImports,
  );
};

const generateDefinition = (
  name: string,
  route: string,
  getResponseMockFunctionNameBase: string,
  handlerNameBase: string,
  { operationId, response, verb, tags }: GeneratorVerbOptions,
  { override, context, mock }: GeneratorOptions,
  returnType: string,
  status: string,
  responseImports: GeneratorImport[],
  responses: ResReqTypesValue[],
  contentTypes: string[],
) => {
  const { definitions, definition, imports } = getMockDefinition({
    operationId,
    tags,
    returnType,
    responses,
    imports: responseImports,
    override,
    context,
    mockOptions: !isFunction(mock) ? mock : undefined,
  });

  const mockData = getMockOptionsDataOverride(operationId, override);

  let value = '';

  if (mockData) {
    value = mockData;
  } else if (definitions.length > 1) {
    value = `faker.helpers.arrayElement(${definition})`;
  } else if (definitions[0]) {
    value = definitions[0];
  }

  const isResponseOverridable = value.includes(overrideVarName);
  const isTextPlain = contentTypes.includes('text/plain');
  const isReturnHttpResponse = value && value !== 'undefined';

  const getResponseMockFunctionName = `${getResponseMockFunctionNameBase}${pascal(name)}`;
  const handlerName = `${handlerNameBase}${pascal(name)}`;

  const mockImplementation = isReturnHttpResponse
    ? `export const ${getResponseMockFunctionName} = (${isResponseOverridable ? `overrideResponse: any = {}` : ''})${mockData ? '' : `: ${returnType}`} => (${value})\n\n`
    : '';

  const delayTime = getDelay(override, !isFunction(mock) ? mock : undefined);
  const handlerImplementation = `
export const ${handlerName} = (${isReturnHttpResponse && !isTextPlain ? `overrideResponse?: ${returnType}` : ''}) => {
  return http.${verb}('${route}', async () => {
    await delay(${isFunction(delayTime) ? `(${delayTime})()` : delayTime});
    return new HttpResponse(${
      isReturnHttpResponse
        ? isTextPlain
          ? `${getResponseMockFunctionName}()`
          : `JSON.stringify(overrideResponse !== undefined ? overrideResponse : ${getResponseMockFunctionName}())`
        : null
    },
      {
        status: ${status === 'default' ? 200 : status.replace(/XX$/, '00')},
        headers: {
          'Content-Type': '${isTextPlain ? 'text/plain' : 'application/json'}',
        }
      }
    )
  })
}\n`;

  const includeResponseImports =
    isReturnHttpResponse && !isTextPlain
      ? [
          ...imports,
          ...response.imports.filter((r) => {
            // Only include imports which are actually used in mock.
            const reg = new RegExp(`\\b${r.name}\\b`);
            return (
              reg.test(handlerImplementation) || reg.test(mockImplementation)
            );
          }),
        ]
      : imports;

  return {
    implementation: {
      function: mockImplementation,
      handlerName: handlerName,
      handler: handlerImplementation,
    },
    imports: includeResponseImports,
  };
};

export const generateMSW = (
  generatorVerbOptions: GeneratorVerbOptions,
  generatorOptions: GeneratorOptions,
) => {
  const { pathRoute, override, mock } = generatorOptions;
  const { operationId, response } = generatorVerbOptions;

  const route = getRouteMSW(
    pathRoute,
    override?.mock?.baseUrl ?? (!isFunction(mock) ? mock?.baseUrl : undefined),
  );

  const handlerName = `get${pascal(operationId)}MockHandler`;
  const getResponseMockFunctionName = `get${pascal(operationId)}ResponseMock`;

  const baseDefinition = generateDefinition(
    '',
    route,
    getResponseMockFunctionName,
    handlerName,
    generatorVerbOptions,
    generatorOptions,
    response.definition.success,
    '200',
    response.imports,
    response.types.success,
    response.contentTypes,
  );

  const mockImplementations = [baseDefinition.implementation.function];
  const handlerImplementations = [baseDefinition.implementation.handler];
  const imports = [...baseDefinition.imports];

  if (
    generatorOptions.mock &&
    isObject(generatorOptions.mock) &&
    generatorOptions.mock.generateEachHttpStatus
  ) {
    [...response.types.success, ...response.types.errors].forEach(
      (statusResponse) => {
        const definition = generateDefinition(
          statusResponse.key,
          route,
          getResponseMockFunctionName,
          handlerName,
          generatorVerbOptions,
          generatorOptions,
          statusResponse.value,
          statusResponse.key,
          response.imports,
          [statusResponse],
          [statusResponse.contentType],
        );
        mockImplementations.push(definition.implementation.function);
        handlerImplementations.push(definition.implementation.handler);
        imports.push(...definition.imports);
      },
    );
  }

  return {
    implementation: {
      function: mockImplementations.join('\n'),
      handlerName: handlerName,
      handler: handlerImplementations.join('\n'),
    },
    imports: imports,
  };
};
