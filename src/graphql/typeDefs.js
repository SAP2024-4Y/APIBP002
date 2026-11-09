'use strict';

const fs = require('fs');
const path = require('path');

// The committed SDL is the single authoritative schema; the server loads it
// verbatim so /graphql always matches docs/schema.graphql.
const typeDefs = fs.readFileSync(
  path.join(__dirname, '..', '..', 'docs', 'schema.graphql'),
  'utf8'
);

module.exports = typeDefs;
