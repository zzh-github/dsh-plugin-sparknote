---
kind: package-bundle
description: "Highlight completed DSH replies before collecting their text and annotations."
---

# Reading Collection

[中文](README.zh.md) | [English](README.md)

> **Compatibility:** plugin `0.1.0` requires **DSH `0.2.1-rc.2` · Web**.
>
> `package.json` pins `engines.dsh` to this exact version. Other DSH versions, including newer releases, and Desktop installation have not been verified.

## Summary

Highlight replies while reading, then collect the whole reply with all its marks. Highlights save automatically before collection. The collection keeps a copy of the reply so it remains readable after its source session is deleted. This optional bundle adds a collection to your Web profile.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Community and contribution](#community-and-contribution)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Install the supplied `dsh-reading-collection-0.1.0.tgz` through the Plugins page or the CLI for your Web profile, then restart that profile. With sibling `DSH` and `DSH_plugin/reading-collection` directories, run from the Harness checkout:

```sh
pnpm dsh plugin --profile web add ../DSH_plugin/reading-collection/artifacts/dsh-reading-collection-0.1.0.tgz
```

Select text in a completed reply and choose yellow, green, blue, or pink. Click an existing highlight to change or remove it. The pin action below the reply collects its full Markdown and existing highlights. Open Collection in the sidebar to search, rename, read, edit highlights, or open the source conversation. Removing a collection keeps its highlight draft.

Changes show as saved only after the Host commits them. A failed operation keeps existing data and offers Retry. Data is stored in the `reading_collection` storage domain under the Harness home, using the profile's configured storage provider. Unloading the bundle removes its UI without deleting its data.

For plugin development, run `pnpm install`, `pnpm run typecheck`, `pnpm test`, and `pnpm run pack:bundle` in this directory. The bundle has its own lockfile and does not modify the Harness workspace dependency graph.

This directory is an independent Git repository. Run plugin Git commands here and Harness Git commands in the DSH checkout. To prepare a keyless recorded-session check, run `pnpm run prepare:smoke --dsh-root D:/00-code/DSH`; omission of `--dsh-root` uses the sibling `DSH` directory. The script prints isolated test paths and does not start a server.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

The profile patch mounts one Host plugin and its browser contribution. The Host validates owner-only RPC requests and serializes mutations to versioned storage records. The browser uses additive Chat, sidebar, main-panel, and overlay slots. A release-specific DOM adapter maps text selections to completed Chat nodes and paints CSS Custom Highlights without modifying React-owned content. Exact quotes and surrounding text locate highlights after layout changes; ambiguous matches remain unpainted and their saved quotes remain available.

</details>

<a id="model-experience"></a>
## Model Experience

This bundle contributes no model tools or prompt content. Collections and annotations are private reading data and do not enter the model context.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

Only completed text replies with a standard action row are supported. Streaming replies, reasoning, images, freehand drawing, and cross-message selections are excluded. Text highlighting needs a current browser with CSS Custom Highlight support. The DOM adapter is pinned to the declared DSH version; Desktop installation is unverified. Other browser windows refresh their collection when focused; live multi-window updates and collection export are not included. Opening the source returns to its conversation, without paging to the exact historical message.

<a id="community-and-contribution"></a>
## Community and contribution

This is an independently maintained community plugin. The DSH [contribution guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/CONTRIBUTING.md) asks plugin authors to add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) GitHub repository topic so others can discover their work. Report plugin bugs and suggest improvements in [this repository's Issues](https://github.com/zzh-github/dsh-plugin-sparknote/issues).

<a id="dev-note"></a>
## Dev Note

None.
