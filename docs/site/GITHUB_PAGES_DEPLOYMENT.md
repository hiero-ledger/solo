# Deploying Solo Docs to GitHub Pages

This guide explains how to deploy the Solo documentation site to GitHub Pages from your personal repository.

## Prerequisites

- A GitHub account
- The Solo repository forked or copied to your account

## Setup Instructions

### Step 1: Enable GitHub Pages

1. Go to your GitHub repository
2. Click **Settings** → **Pages** (in the left sidebar)
3. Under **Source**, select **GitHub Actions**
4. Click **Save**

### Step 2: Configure Base URL

The workflow is configured for a **project page** (e.g., `https://username.github.io/solo`).

**If your repository is named `username.github.io`** (a user/organization site), update the baseURL in `.github/workflows/deploy-personal-pages.yaml`:

Change this line:
```yaml
npx hugo --minify --baseURL "https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}/" -d public
```

To:
```yaml
npx hugo --minify --baseURL "https://${{ github.repository_owner }}.github.io/" -d public
```

### Step 3: Push to Main Branch

```bash
git add .
git commit -m "Add GitHub Pages deployment workflow"
git push origin main
```

The workflow will automatically:
1. Build the Hugo site
2. Generate all documentation files
3. Deploy to GitHub Pages

### Step 4: Access Your Site

After the workflow completes (check **Actions** tab), your site will be available at:

- **Project page**: `https://username.github.io/repository-name/`
- **User page**: `https://username.github.io/`

## Manual Deployment

You can also trigger a deployment manually:

1. Go to **Actions** tab
2. Click **Deploy to GitHub Pages (Personal)**
3. Click **Run workflow**
4. Select the branch (usually `main`)
5. Click **Run workflow**

## Local Testing Before Deployment

Before pushing, you can test the site locally:

```powershell
cd docs/site

# Generate examples
.\scripts\build-examples.ps1

# Start Hugo server
$env:HUGO_SOLO_VERSION="main"; npx hugo server -e dev -DFE --minify --baseURL "http://localhost:1313/main/" -d public/main
```

Visit: http://localhost:1313/main/

## Troubleshooting

### Build Fails

- Check the **Actions** tab for error messages
- Ensure all dependencies are committed
- Verify the workflow file syntax

### Site Doesn't Update

- Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
- Check if the workflow completed successfully
- Verify the baseURL matches your repository setup

### Examples Missing

The workflow automatically generates example pages from `examples/*/README.md` files. If examples are missing:

1. Ensure the example README files exist
2. Check the build logs in the Actions tab
3. Verify the example is listed in the workflow's example loop

## Differences from Official Deployment

The personal deployment workflow is simplified compared to the official Solo CI/CD:

- Uses standard GitHub-hosted runners (no custom runners required)
- Simpler build process (no versioning, no release artifacts)
- Deploys only to GitHub Pages (no npm publishing)
- Single "main" version only

## Customization

You can customize the workflow by editing `.github/workflows/deploy-personal-pages.yaml`:

- Change the trigger (branches, schedule)
- Modify the baseURL
- Add additional build steps
- Configure custom Hugo parameters

## Need Help?

- Check the [Hugo documentation](https://gohugo.io/documentation/)
- Review [Docsy theme docs](https://www.docsy.dev/docs/)
- See [GitHub Pages documentation](https://docs.github.com/en/pages)
