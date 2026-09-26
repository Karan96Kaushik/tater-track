import { json, withHttp } from '../_shared/http.js';

export const handler = withHttp(async () =>
  json(501, {
    error: 'AI chat is not enabled yet',
    hint: 'Set CEREBRAS_API_KEY as an Amplify secret and implement lib/cerebras/client.ts.',
  }),
);
