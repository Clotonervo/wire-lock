# Deploying Wire Lock

Two free pieces (DESIGN.md §2):

- **Game server** on Render: a free web service in Frankfurt, built from `Dockerfile` using the `render.yaml` blueprint.
- **Client** on Vercel: its own Hobby project at `game.samhopkins.dev`, configured by `client/vercel.json`.

Both redeploy automatically when you push to `main`, and each only rebuilds when its own code changes.

## 1. Server (Render), about 5 minutes

1. Sign in at [render.com](https://render.com) with GitHub, and allow it to access the `wire-lock` repo.
2. Go to **New → Blueprint**, pick `Clotonervo/wire-lock`, then click **Apply**. Render reads `render.yaml` and creates the `wire-lock-server` service.
3. Wait for the first deploy, then note the service URL, e.g. `https://wire-lock-server.onrender.com`. Opening `…/health` should show `{"ok":true,…}`.

`ALLOWED_ORIGINS` is set to `https://game.samhopkins.dev` in the blueprint. To play from the Vercel URL as well (e.g. `https://wire-lock.vercel.app`), add it to that variable in Render with a comma between the two, and redeploy.

Free instances sleep after about 15 minutes idle. The first visitor then sees "Waking up the server…" for up to a minute.

## 2. Client (Vercel), about 5 minutes

1. In Vercel, go to **Add New → Project** and import `Clotonervo/wire-lock`.
2. Set **Root Directory** to `client`. The build settings come from `client/vercel.json`, so leave them alone.
3. Add the environment variable `VITE_SERVER_URL` = `wss://wire-lock-server.onrender.com`, using your Render URL with `https` replaced by `wss`.
4. Click **Deploy**.
5. Go to **Settings → Domains** and add `game.samhopkins.dev`:
   - If `samhopkins.dev` uses Vercel's nameservers, that's all.
   - Otherwise, add the CNAME record Vercel shows at your DNS provider.

## 3. Play

Open `https://game.samhopkins.dev`, create a room, press Esc, then **Copy invite link** and send it to a friend.

## Changing the server URL or allowed origins later

- **Client:** in Vercel, change `VITE_SERVER_URL`, then redeploy. It's baked in at build time.
- **Server:** in Render, change `ALLOWED_ORIGINS`. It's read at start-up, so Render restarts the service.
