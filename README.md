# Verkstan

Tre verkstäder där man målar egna saker till Minecraft Bedrock direkt i webbläsaren:

- **Skinverkstaden**: egna skins (PNG)
- **Föremålsverkstaden**: mat, vapen, verktyg, rustningar och material med recept (add-on)
- **Mobverkstaden**: djur, monster och drakar som kan tämjas och ridas (add-on)

Öppna: https://krajdan.github.io/minecraft-verkstan/

Fungerar på dator, platta och mobil. Allt sparas lokalt i webbläsaren.

---

Ett fristående hobbyprojekt. Inte en officiell Minecraft-produkt. Inte godkänd av eller kopplad till Mojang eller Microsoft.

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.

3D-figurerna använder [three.js](https://threejs.org) (MIT-licens, se `lib/three.min.js`).

## Bygga om

Källfilerna ligger i `src/`. Efter en ändring:

```
python3 src/build.py --site . --out src/build
```

Det bygger om sidorna i roten. I `src/build/standalone/` hamnar fristående filer som går att öppna direkt på en dator utan internet.
