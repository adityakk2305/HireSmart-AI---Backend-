import { Router } from "express";
import { openApiDocument } from "../docs/openApi.js";

const router = Router();

router.get("/openapi.json", (_req, res) => {
  res.status(200).json(openApiDocument);
});

router.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HireSmart AI API Docs</title>
    <style>
      body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: #0f172a; background: #f8fafc; }
      main { max-width: 980px; margin: 0 auto; padding: 40px 20px; }
      h1 { margin: 0 0 8px; font-size: 32px; }
      a { color: #2563eb; }
      section { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-top: 20px; }
      code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
      li { margin: 8px 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>HireSmart AI API Docs</h1>
      <p>OpenAPI 3.0 documentation for the production API.</p>
      <section>
        <h2>OpenAPI</h2>
        <p>Download or import the machine-readable spec from <a href="/api/v1/docs/openapi.json"><code>/api/v1/docs/openapi.json</code></a>.</p>
      </section>
      <section>
        <h2>Route Groups</h2>
        <ul>
          <li>Auth, Jobs, Candidates, AI Resume Parsing and Screening</li>
          <li>Interviews, Emails, Analytics, Admin</li>
          <li>Health: <code>/health</code>, <code>/health/live</code>, <code>/health/ready</code></li>
        </ul>
      </section>
    </main>
  </body>
</html>`);
});

export default router;
