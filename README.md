# Meniscus

Research peptide **reconstitution calculator**, **library**, **blends**, **stack builder**, and **user-defined titration plans**.

**Not medical advice.** Not a prescription. Not an instruction to administer or compound anything.

## Tabs

1. **Calc** — vial + diluent + dose → U-100 units / mL  
2. **Library** — full compound list with evidence badges  
3. **Blends** — popular research combinations (not clinical regimens)  
4. **Stack** — multi-peptide stack with range flags (low / high / no data)  
5. **Plan** — *you* enter titration steps (duration in weeks or days, times per day). Nothing is recommended.

## Host on GitHub Pages

1. Create a **public** repository.  
2. Upload all files in this folder to the **root** (`index.html` at top level).  
3. **Settings → Pages** → Deploy from branch → `main` / root.  
4. Site: `https://YOUR_USERNAME.github.io/REPO_NAME/`

## Local

Open `index.html` or:

```bash
python3 -m http.server 8080
```

## Data

Edit `data.js` to add peptides or blends. Keep sources honest. Do not invent human ranges.
