import { defineConfig } from '@vetster/orval';

export default defineConfig({
  petstore: {
    output: {
      mode: 'split',
      target: 'src/petstore.ts',
      client: 'hono',
      override: {
        hono: {
          handlers: 'src/handlers',
        },
        zod: {
          strict: {
            response: true,
          },
        },
      },
    },
    input: {
      target: './petstore.yaml',
    },
  },
});
