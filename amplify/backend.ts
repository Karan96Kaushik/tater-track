import './loadEnv.js';
import { defineBackend } from '@aws-amplify/backend';
import { FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { aiChat } from './functions/ai-chat/resource.js';
import { reportIssue } from './functions/report-issue/resource.js';
import { amplifyTest } from './functions/test/resource.js';
import { tmdbDetails } from './functions/tmdb-details/resource.js';
import { tmdbSearch } from './functions/tmdb-search/resource.js';
import { trackMedia } from './functions/track-media/resource.js';
import { upcomingEpisodes } from './functions/upcoming-episodes/resource.js';

/**
 * Functions only — auth is Supabase, so this stack defines no Cognito resources.
 * Each Lambda is exposed via a Function URL with auth type NONE and verifies the
 * caller's Supabase JWT itself.
 */
const backend = defineBackend({
  tmdbSearch,
  tmdbDetails,
  trackMedia,
  upcomingEpisodes,
  reportIssue,
  amplifyTest,
  aiChat,
});

const functions = {
  tmdbSearchUrl: backend.tmdbSearch,
  tmdbDetailsUrl: backend.tmdbDetails,
  trackMediaUrl: backend.trackMedia,
  upcomingEpisodesUrl: backend.upcomingEpisodes,
  reportIssueUrl: backend.reportIssue,
  amplifyTestUrl: backend.amplifyTest,
  aiChatUrl: backend.aiChat,
} as const;

const custom: Record<string, string> = {};

for (const [outputKey, resource] of Object.entries(functions)) {
  const functionUrl = resource.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: ['*'],
      allowedMethods: [HttpMethod.POST],
      allowedHeaders: ['content-type', 'authorization'],
      maxAge: undefined,
    },
  });
  custom[outputKey] = functionUrl.url;
}

backend.addOutput({ custom });
