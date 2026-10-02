# About the tool

`nada` is a convenient CLI tool that makes the dependency installation process much nicer and more user-friendly.

---

### Who is it most usefull for?

You can use `nada` in any project, but **monorepos** is where it actually shines.

---

### Why is it called `nada`?

The name is a reference to the well-known Russian meme "Nnnnnа́da?" (the word means "need", and most
people pronounce it as "Nа́do", with the stress on the first syllable). The English equivalent would
be something like "Nnnnneeda?". You can easily Google it, but briefly, this meme is about a guy with
a funny accent who offers everybody chaplets, saying: "Chaplets nnnnnada?" (Eng. "Nnnnneéde
chaplets?").

### But how is it related?

Well, frameworks, libraries, and other packages are crucial for our work. But instead of having
someone offer them to us, we ask our preferred package managers to get them delivered straight to
our virtual environments. We kinda say "nnnnada react redux typescript", meaning we "need react
redux typescript". But I'm just lazy — extremely lazy — to write four extra "n" characters, hence
the name :)

---

### Requirements for the tool

I like to be on the edge and use all the latest niceties that 
our favourite dev tools have to offer. This is the reason this project
has a pretty high bar for supported `node` and `pnpm` versions.

#### Pnpm

- First, pnpm is the only supported package managerr, and supporting other players is not in the
  plans. Pnpm's workspaces is basically an industry standard for monorepos at the moment.

- Secondly, the minimal supported pnpm version is `>=12.7.0`, as `nada` uses many of its newly implemented features.

#### Node

 Node's version requirements are not that high. It's guaranteed to work on `>=24.0.0`, but might also work on older versions.

#### Package.json

If your package.json contains the following section, you're good to go.

```json
{
  "devEngines": {
    "runtime": {
      "name": "node",
      "version": "v24.0.0"
    },
    "packageManager": {
      "name": "pnpm",
      "version": ">=12.0.0"
    }
  }
}
```
