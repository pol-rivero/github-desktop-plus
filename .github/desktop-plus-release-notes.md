Desktop Plus v3.6.4-alpha4

## **Changes and improvements:**

- [#32] After a long wait, we finally support **self-hosted** GitLab and Forgejo instances!  
  To sign in, go to Options > Accounts and click "Add self-hosted instance...". Keep in mind that self-hosted support is currently experimental. If you encounter any problems, please [open an issue](https://github.com/desktop-plus/desktop-plus/issues/new/choose).  

- [#214] Building on top of the self-hosted support we just added, we now also support **Gitea** instances. Thank you @eliasSFL for contributing an early draft!  
  Gitea support is also experimental, so please report any issues you encounter.

- [#229] The "View in your browser" button is now available for all remotes, not just for a whitelist of trusted hosts. This means you will always have the option to open a repository in your browser, even if the provider is not supported or you decide not to sign in to it.  
  Please note that the web UI URL that will be opened in the browser is a best-effort guess, especially for SSH remotes.

### Limitations of self-hosted support
- Subpath deployments are not supported. For example, you **cannot** use `https://example.com/gitlab` as your self-hosted instance URL.  
  Subdomains and non-standard ports are supported, so you **can** use `https://gitlab.example.com` or `http://localhost:1234`.

- The sign-in process doesn't currently use OAuth2 and instead requires providing a generated Personal Access Token (PAT).  

> [!NOTE]
> This is not a technical limitation. This flow was chosen because I believe it's a better UX for self-hosted instances. Otherwise, everyone would need to create an OAuth2 application for their instance and then provide the client ID and secret to sign in, which is a lot more work for the user.

- If the API of your self-hosted instance is protected by Anubis, Cloudflare (in Bot Fight mode), or similar security mechanisms, the application won't be able to sign in. There is nothing I can do about this, as preventing non-browser traffic is the entire point of those mechanisms.  
  Consider contacting your instance administrator to see if they can whitelist the application's `User-Agent` in the API paths. For example, if using Anubis, add the following to your policy YAML file:
  ```yaml
  bots:
  - name: desktop-plus
    action: ALLOW
    expression:
      all:
        - 'userAgent.startsWith("GitHubDesktop/")'
        - 'path.startsWith("/api/")'
  ```

- Self-hosted Bitbucket Server instances are not supported at the moment. Their API is not compatible with Bitbucket Cloud, so implementating support would be an entire new feature, which is outside the scope of this release. If you want this feature, please open an issue to show your interest.

