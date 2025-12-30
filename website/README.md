# Meet Without Fear - Website

A Next.js website for Meet Without Fear with the following features:

- Landing page with dark mode design
- App download page (iOS TestFlight / Android APK)
- Invitation link flow with Clerk authentication
- Automatic account creation and session linking

## Getting Started

### Prerequisites

- Node.js 18+
- A Clerk account (https://clerk.com)
- Access to the Meet Without Fear backend API

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_TESTFLIGHT_URL` | iOS TestFlight invitation URL |
| `NEXT_PUBLIC_ANDROID_APK_URL` | Android APK download URL |

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The website will be available at http://localhost:3001.

### Production Build

```bash
npm run build
npm start
```

## Deployment to Vercel

1. Push the code to a Git repository
2. Connect the repository to Vercel
3. Set the environment variables in Vercel dashboard
4. Deploy

### Vercel Environment Variables

Set these in your Vercel project settings:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_API_URL` (e.g., `https://api.meetwithoutfear.com`)
- `NEXT_PUBLIC_TESTFLIGHT_URL`
- `NEXT_PUBLIC_ANDROID_APK_URL`

## Invitation Flow

When a user opens an invitation link (`/invitation/{id}`):

1. The page fetches invitation details from the API
2. If the invitation is valid and the user is not signed in, they see a sign-up/sign-in form
3. After authentication, the invitation is automatically accepted
4. The user is redirected to the app download page

## Project Structure

```
website/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Landing page
│   ├── app/               # /app - App download page
│   ├── invitation/[id]/   # /invitation/{id} - Invitation handling
│   ├── sign-in/           # /sign-in - Clerk sign-in
│   └── sign-up/           # /sign-up - Clerk sign-up
├── components/            # Reusable React components
├── lib/                   # Utility functions and API client
├── middleware.ts          # Clerk authentication middleware
└── tailwind.config.ts     # Tailwind CSS configuration
```
