'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const {
  ApolloServerPluginLandingPageLocalDefault,
} = require('@apollo/server/plugin/landingPage/default');
const { GraphQLError } = require('graphql');

const typeDefs = require('./graphql/typeDefs');
const { resolvers } = require('./graphql/resolvers');
const { createLoaders } = require('./graphql/loaders');
const { principalFromHeader } = require('./auth/jwt');
const { consume, clientKey } = require('./middleware/rateLimit');
const { restRateLimit } = require('./middleware/rateLimit');
const { attachUser } = require('./auth/middleware');
const restRouter = require('./rest/router');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { getDb } = require('./db/client');
const { seed } = require('./db/seed');
const { loadOpenApiDocument, readOpenApiRaw, swaggerUi } = require('./docs/swagger');

// Applies the shared rate limiter to GraphQL with a paradigm-correct error.
const graphqlRateLimitPlugin = {
  async requestDidStart() {
    let result = null;
    return {
      async didResolveOperation(ctx) {
        result = consume(ctx.contextValue.clientKey);
        if (result.limited) {
          throw new GraphQLError('Too many requests. Slow down and retry later.', {
            extensions: { code: 'RATE_LIMITED', http: { status: 429 } },
          });
        }
      },
      async willSendResponse(ctx) {
        if (!result || !ctx.response.http) return;
        const headers = ctx.response.http.headers;
        headers.set('RateLimit-Limit', String(result.limit));
        headers.set('RateLimit-Remaining', String(result.remaining));
        headers.set('RateLimit-Reset', String(result.reset));
        if (result.limited) headers.set('Retry-After', String(result.reset));
      },
    };
  },
};

async function buildApp() {
  // Schema + seed are created up front so the service is request-ready on boot.
  const db = getDb();
  seed(db);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'shopmesh', time: new Date().toISOString() });
  });

  // Interactive REST docs served directly from the running service.
  const openApiDoc = loadOpenApiDocument();
  app.get('/openapi.yaml', (_req, res) => res.type('text/yaml').send(readOpenApiRaw()));
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDoc, { customSiteTitle: 'ShopMesh — REST API Docs' })
  );

  // GraphQL endpoint + embedded IDE at /graphql.
  const apollo = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
    plugins: [ApolloServerPluginLandingPageLocalDefault({ embed: true }), graphqlRateLimitPlugin],
  });
  await apollo.start();
  app.use(
    '/graphql',
    expressMiddleware(apollo, {
      context: async ({ req, res }) => ({
        user: principalFromHeader(req.headers.authorization),
        loaders: createLoaders(),
        clientKey: clientKey(req),
        res,
      }),
    })
  );

  // REST business API under /api/v1 (rate-limited, auth-aware).
  app.use('/api/v1', restRateLimit, attachUser, restRouter);
  app.use('/api', notFoundHandler);

  // Static React frontend (built into ./public by the Docker image).
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/graphql') ||
      req.path.startsWith('/docs') ||
      req.path === '/health'
    ) {
      return next();
    }
    const indexHtml = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
    return next();
  });

  app.use(errorHandler);

  return { app, apollo };
}

module.exports = { buildApp };
