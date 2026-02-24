# TRU OER Activity Builder — Open Press Team Briefing
**How to ensure your book appears in the Activity Builder**

---

## What is the Activity Builder?

The TRU OER Activity Builder is a tool that lets instructors select a TRU Open Press book, load a chapter, and use AI to automatically generate quiz questions and learning activities from that content. The tool pulls its book list directly from the Pressbooks network via the public REST API.

---

## The Problem: Signal-to-Noise in the Book List

The Pressbooks network at `pressbooks.tru.ca` currently hosts **164 books** — a mix of published OERs, personal sandboxes, development sites, one-off workshops, and test books. Without filtering, the Activity Builder would present all of these to instructors, making it difficult to find real OERs.

To address this, the Activity Builder uses a two-layer filtering approach to show only relevant books.

---

## How Books Are Filtered

### Layer 1 — The Official Flag (Recommended)

Pressbooks has a built-in **"In Catalog"** setting for each book. When a book is marked as *In Catalog*, the Activity Builder will **always display it**, regardless of any other filter.

This is the cleanest, most reliable method. If your book should be in the Activity Builder, this is the right way to ensure it appears.

**Currently, only 19 of 164 books have this flag set.**

### Layer 2 — Keyword Heuristics (Automatic Fallback)

Books *not* marked In Catalog are checked against keyword lists. Books whose URL slug or title contains any of the following words are automatically hidden:

| Checked against | Keywords that trigger removal |
|---|---|
| Book URL slug | `sandbox`, `sample`, `test`, `demo`, `h5p`, `hypothesis`, `import`, `workshop`, `template`, `training`, `trial`, `temp`, `-dev`, `devsite`, `dev2` |
| Book title | `sandbox`, `sample`, `testbook`, `test book`, `demo book`, `workshop`, `template`, `dev site`, `dev 2` |

After filtering, approximately **122 books** pass through as likely legitimate OERs.

---

## What the Open Press Team Should Do

The single most effective action is to **mark official TRU Open Press books as "In Catalog"** in the Pressbooks Network Manager. This takes about 30 seconds per book, requires no technical knowledge, and is permanent.

### Step-by-step instructions (no server access needed)

1. Log in to Pressbooks as a **Network Administrator** at:
   `https://pressbooks.tru.ca/wp-admin/network/`

2. In the left menu, go to **Sites** and find the book you want to add.

3. Click **Edit** under that book's entry.

4. Click the **Settings** tab at the top of the edit screen.

5. Look for the **Book Information** section. Find the option labelled **"In Catalog"** (it may also appear as "Include in Network Catalog").

6. Check the box or toggle it to **Yes / Enabled**.

7. Click **Save Changes**.

8. Repeat for each official Open Press title.

That's it. The Activity Builder checks this flag live — no code changes or restarts required.

---

## Which Books Should Be Marked In Catalog?

The intent is to include books that:
- Are published and publicly accessible
- Are genuine Open Educational Resources (not sandboxes, drafts, or personal dev sites)
- Would be appropriate for an instructor to use as course material

If a book is listed on `openpress.trubox.ca/projects/`, it should almost certainly be marked In Catalog.

---

## What Happens to Books That Aren't Marked?

They may still appear in the Activity Builder if they pass the keyword heuristic (i.e., their title and URL slug don't contain words like "sandbox", "dev", "test", etc.). Instructors also have a **"Show all books"** toggle to bypass all filtering if they're looking for something specific.

---

## Summary

| Action | Who | Effort | Effect |
|---|---|---|---|
| Mark book as "In Catalog" in Pressbooks Network Manager | Open Press Team / Network Admin | ~30 seconds per book | Book always appears in Activity Builder |
| Do nothing | — | — | Book may or may not appear depending on keyword heuristics |
| Add keywords to filter list | Developer | Minor code change | Improves automatic filtering for future books |

**Recommendation:** Work through the official Open Press titles and mark them In Catalog. This takes less than an hour for the full catalog and creates the authoritative, curated list that the Activity Builder — and future tools — can rely on.

---

*TRU OER Activity Builder — Internal briefing, 2025*
