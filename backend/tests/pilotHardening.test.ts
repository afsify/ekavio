import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relative: string) => readFile(new URL(relative, import.meta.url), 'utf8');

test('runtime-sensitive container images are immutable and CI uses the same database images', async () => {
  const [backendDockerfile, frontendDockerfile, compose, workflow] = await Promise.all([
    source('../Dockerfile'),
    source('../../frontend/Dockerfile'),
    source('../../docker-compose.yml'),
    source('../../.github/workflows/ci.yml'),
  ]);
  const nodeImage = 'node:20.20.2-alpine3.23@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293';
  const nginxImage = 'nginx:1.31.6-alpine3.24@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2';
  const postgresImage = 'postgres:17.11-alpine3.23@sha256:9ae4e8f8d0284836a505f0b2e825144e32e20499856e7dc5f7b99e19d10eedd6';
  const mongoImage = 'mongo:8.0.30-noble@sha256:f40b97b97ce805c48ab428ce4422180ae0ef0de6dacadf1e32c6e6a1cbc9353d';

  assert.match(backendDockerfile, new RegExp(nodeImage.replaceAll('.', '\\.')));
  assert.match(frontendDockerfile, new RegExp(nodeImage.replaceAll('.', '\\.')));
  assert.match(frontendDockerfile, new RegExp(nginxImage.replaceAll('.', '\\.')));
  assert.ok(compose.includes(postgresImage));
  assert.ok(workflow.includes(postgresImage));
  assert.ok(compose.includes(mongoImage));
  assert.ok(workflow.includes(mongoImage));
  assert.ok(workflow.includes("node-version: '20.20.2'"));
});

test('production containers retain least-privilege and artifact boundaries', async () => {
  const [backendDockerfile, frontendDockerfile, backendIgnore, frontendIgnore] = await Promise.all([
    source('../Dockerfile'),
    source('../../frontend/Dockerfile'),
    source('../.dockerignore'),
    source('../../frontend/.dockerignore'),
  ]);

  assert.match(backendDockerfile, /FROM \$\{NODE_IMAGE\} AS production/);
  assert.match(backendDockerfile, /npm ci --omit=dev/);
  assert.match(backendDockerfile, /COPY --chown=node:node --from=build \/app\/dist \.\/dist/);
  assert.match(backendDockerfile, /USER node/);
  assert.match(backendDockerfile, /CMD \["node", "dist\/server\.js"\]/);
  assert.equal(backendDockerfile.includes('npm run dev'), false);

  assert.match(frontendDockerfile, /FROM \$\{NGINX_IMAGE\}/);
  assert.match(frontendDockerfile, /COPY --from=build \/app\/dist \/usr\/share\/nginx\/html/);
  assert.match(frontendDockerfile, /USER nginx/);
  assert.equal(frontendDockerfile.includes('COPY --from=build /app/node_modules'), false);

  for (const ignoreFile of [backendIgnore, frontendIgnore]) {
    assert.ok(ignoreFile.includes('.env'));
    assert.ok(ignoreFile.includes('node_modules'));
    assert.ok(ignoreFile.includes('dist'));
  }
  assert.ok(backendIgnore.includes('*.dump'));
  assert.ok(backendIgnore.includes('*.archive'));
});

test('logical backup tooling fails closed around credentials and repository artifacts', async () => {
  const [tooling, backup, restore] = await Promise.all([
    source('../../scripts/postgres-tooling.mjs'),
    source('../../scripts/postgres-backup.mjs'),
    source('../../scripts/postgres-restore-proof.mjs'),
  ]);

  assert.match(tooling, /must be outside the repository/);
  assert.match(tooling, /flags: 'wx'/);
  assert.match(tooling, /\[redacted\]/);
  assert.match(backup, /--format=custom --no-owner --no-acl/);
  assert.match(backup, /--output-dir/);
  assert.match(backup, /validateArchive/);
  assert.equal(backup.includes('console.log(connectionValue)'), false);
  assert.match(restore, /\^ekavio_v207a_restore_/);
  assert.match(restore, /--exit-on-error --no-owner --no-acl/);
  assert.match(restore, /postgresRestoreIntegrity\.js/);
});
