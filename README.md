# Zheren Lab — Website

Source code for the website of the Zheren Lab, Department of Biochemistry,
School of Biological and Behavioural Sciences, Queen Mary University of London.

The lab combines synthetic and evolutionary biology to study microbial
division of labour and beyond — for both fundamental discovery and biotechnology.

🔗 **Live site:** https://zherenzhanglab.github.io

## Editing

Homepage content lives in `index.html`. Its presentation uses `tokens.css`,
`base.css`, `prototype.css` and `site.css`, alongside the existing styles and
scripts for the opening sequence, Hero interaction, Research and Lab Journey.
The Growth Curve Analyser remains in `tools/growth-curve-analyser/`.

This is a static site with no build command. Preview locally from the repository
root with `python3 -m http.server 4175 --bind 127.0.0.1`.

GitHub Pages publishes the repository root from `main`; committing to a redesign
branch does not deploy it. Superseded preview files have been removed from the
current website tree; earlier versions remain recoverable from Git history.
