# Deploy To Vercel + Custom Domain

## 1) Push This Repo

1. Create a GitHub repo.
2. Push this project to GitHub.

## 2) Create Vercel Project

1. Go to Vercel and click `Add New Project`.
2. Import your GitHub repo.
3. Build settings:
   - Build command: `npm run build`
   - Output directory: `dist`

## 3) Set Environment Variables

In Vercel project settings, add:

- `FRED_API_KEY` = your FRED API key

This key is used server-side by `/api/fred/*` proxy routes.

## 4) Add Your Domain

1. In Vercel project settings, open `Domains`.
2. Add your domain.
3. In your domain registrar DNS, add the records Vercel shows.
4. Wait for DNS + SSL to finish provisioning.

## 5) Verify API Proxies

After deploy, these app endpoints should work:

- `/api/kalshi/*`
- `/api/civic/*`
- `/api/fred/*`
- `/api/news/*`

## Notes

- Local development still works with `npm run dev` through Vite proxy.
- Production traffic uses Vercel serverless proxy routes in `api/`.
