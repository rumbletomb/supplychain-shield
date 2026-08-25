# GitHub App setup

## 1. Create the application

In GitHub, open **Settings → Developer settings → GitHub Apps → New GitHub App**.

Recommended values:

- GitHub App name: `SupplyChain Shield - <your organization>`
- Homepage URL: the dashboard URL.
- Webhook URL: `https://<public-api>/webhooks/github`
- Webhook secret: at least 32 cryptographically random characters.
- Expire user authorization tokens: enabled.
- Request user authorization during installation: disabled for the current release.

## 2. Repository permissions

| Permission | Access | Reason |
| --- | --- | --- |
| Metadata | Read | Repository identity; GitHub grants this with installations |
| Contents | Read | Download the exact commit archive |
| Pull requests | Read | Receive pull-request metadata and head SHA |
| Checks | Read and write | Create and complete SupplyChain Shield Check Runs |

Do not grant Administration, Issues, Actions, Secrets, or Contents write permission.

## 3. Events

Subscribe to:

- Pull request.
- Installation.
- Installation repositories.

The current API acts only on `opened`, `reopened`, and `synchronize` pull-request actions.

## 4. Private key

Generate a private key in the GitHub App settings. Convert the PEM file to base64 without line
wrapping and place the result in the deployment secret store as `GITHUB_PRIVATE_KEY_BASE64`.

Delete the downloaded plaintext PEM after the secret has been stored safely. Never add it to a
repository, container image, support ticket, or `.env` file committed to source control.

## 5. Environment

Set `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET`, and the externally
reachable `WEB_URL`. Restart the API and worker, then install the app on a test repository.

## 6. Validate

1. Open a pull request that changes a Dockerfile or package lockfile.
2. Confirm that a **SupplyChain Shield** Check Run appears immediately.
3. Confirm that the worker completes the scan and publishes a conclusion.
4. Open the details link and compare the dashboard findings.
5. Redeliver a webhook and verify that duplicate delivery does not create duplicate findings.

Use GitHub's webhook delivery view for transport diagnostics. Application logs deliberately redact
the signature and authorization headers.
