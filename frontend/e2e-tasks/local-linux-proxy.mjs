// Disposable Linux browser container only. Forward just the two loopback QA
// services; no hosted targets, environment credentials or database access.
import net from 'node:net';
if (process.platform !== 'linux') throw new Error('Disposable Linux QA only');
const requested = process.argv.slice(2).map(Number);
const ports = requested.length ? requested : [4177, 5013];
if (ports.some(port => ![4173, 4175, 4177, 5011, 5013].includes(port))) throw new Error('Only explicitly named loopback QA ports are supported');
for (const port of ports) {
  net.createServer(local => {
    const remote = net.connect({ host: 'host.docker.internal', port });
    local.pipe(remote); remote.pipe(local);
    local.on('error', () => remote.destroy()); remote.on('error', () => local.destroy());
    local.on('close', () => remote.destroy()); remote.on('close', () => local.destroy());
  }).listen(port, '127.0.0.1');
}
