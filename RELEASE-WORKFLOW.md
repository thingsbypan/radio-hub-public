# Source control and Windows signing

Radio Hub has a local Git repository on branch `main`. Tag `v1.2.0` records the tested three-module source checkpoint. The repository excludes dependency installations, builds, diagnostic captures, download bundles, environment files and common signing-key formats. Commit identity uses the GitHub noreply address; Git configuration is local to this project.

## Everyday workflow

1. Review changes with `git status` and `git diff`.
2. Run `npm.cmd test` and the runtime tests appropriate to the change.
3. Commit the source changes, then push to the configured GitHub repository.
4. For a new release, update the version and lockfile, build the installer, verify the packaged source and runtime, and tag the tested source.
5. Upload the installer as a release/download artifact, rather than committing it to Git history. A private repository keeps source and its releases private; the installer can be distributed separately on your website.

The GitHub connection in Codex and the local GitHub CLI have separate authorization. Local repository preparation does not itself upload anything. Use browser/device login for CLI authorization; never paste access tokens into source or chat.

## Signing explained

Windows code signing attaches a verified publisher identity and protects the integrity of the shipped executable. It does not certify that an app is bug-free. GitHub hosting, commit signatures and installer signatures are separate things.

As checked October 10, 2026, Microsoft's Azure Artifact Signing Basic plan is approximately $9.99/month. Public-trust signing requires identity verification; individual developers are currently eligible in the US and Canada. This is a paid Azure service, not something enabled by creating a GitHub repository. New signed releases may still trigger SmartScreen warnings while publisher reputation develops.

For Radio Hub, a signing setup would sign the application executable during packaging and the final installer, with timestamping. After signing, generate a new SHA-256 checksum: the current unsigned installer's checksum will no longer apply. Keep the publisher identity consistent across releases. Never commit signing keys or cloud credentials. Automated signing can later use GitHub Actions with narrowly scoped cloud authorization.

Traditional certificate providers are an alternative, generally at a higher annual price. Self-signed certificates are for local testing and are not a useful substitute for public publisher verification. Microsoft Store MSIX distribution can handle signing, but would require a separate packaging/submission workflow.

No paid signing account, identity verification, or signing certificate has been created by this setup. Version 1.2.0 remains unsigned.

Sources: [Microsoft's Windows signing comparison](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options), [Azure Artifact Signing](https://azure.microsoft.com/en-us/products/artifact-signing).
