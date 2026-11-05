'use strict';

const { buildApp } = require('./app');
const config = require('./config');

buildApp()
  .then(({ app }) => {
    const server = app.listen(config.port, () => {
      console.log(`ShopMesh (APIBP002) listening on http://0.0.0.0:${config.port}`);
      console.log(`  REST docs:   /docs   |  GraphQL IDE: /graphql   |  Health: /health`);
    });
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })
  .catch((err) => {
    console.error('Failed to start ShopMesh:', err);
    process.exit(1);
  });
