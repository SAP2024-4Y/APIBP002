'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');

const OPENAPI_PATH = path.join(__dirname, '..', '..', 'docs', 'openapi.yaml');

function loadOpenApiDocument() {
  const raw = fs.readFileSync(OPENAPI_PATH, 'utf8');
  return YAML.parse(raw);
}

function readOpenApiRaw() {
  return fs.readFileSync(OPENAPI_PATH, 'utf8');
}

module.exports = { loadOpenApiDocument, readOpenApiRaw, swaggerUi, OPENAPI_PATH };
