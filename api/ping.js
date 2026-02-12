export default function handler(_req, res) {
  res.setHeader('content-type', 'application/json');
  res.status(200).send(JSON.stringify({ ok: true, service: 'api' }));
}
