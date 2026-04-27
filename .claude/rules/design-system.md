---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.ts"
  - "**/*.css"
globs: ["*.tsx", "*.jsx", "*.ts", "*.css"]
alwaysApply: false
---

# LimeChain Design System

This project uses the LimeChain Design System (shadcn/ui v4 + Tailwind).

Before creating UI components, read `docs/design-system.md` Sections 8-10 for the component catalog and Figma-to-Code mapping. If `docs/design-system.md` does not exist, inspect `globals.css`, theme files, and tailwind config for established patterns.

- **Use shadcn components** — never hand-code what exists in the catalog (`npx shadcn add <name>`)
- **Use design tokens** — never hardcode colors, spacing, or typography values; use CSS variables and Tailwind classes
- **Follow Section 9 patterns** for custom components not covered by shadcn
- **Check Section 11** for organism recipes before composing page layouts
- **All four themes must work** — wireframe-light, wireframe-dark, brand-light, brand-dark
