#!/usr/bin/env bash
set -euo pipefail

# Deploy automático GitHub → Cloudflare
# Requiere: gh auth login o token configurado

PROJECT_DIR="/c/Users/Flakin/Downloads/CRM_Optica_extracted/CRM_Optica_San_Antonio"

cd "$PROJECT_DIR"

echo "== Estado del repo =="
git status --short

echo ""
echo "== Agregando cambios =="
git add -A

echo ""
echo "== Creando commit =="
git commit -m "feat: sidebar moderno, logo SVG, paleta profesional, permisos por rol, login sin gate"

echo ""
echo "== Verificando remote =="
if ! git remote get-url origin &>/dev/null; then
    echo ""
    echo "⚠ No hay remote configurado."
    echo "Para crear el repo y conectar:"
    echo "  1. Ve a github.com y crea un repositorio vacío"
    echo "  2. Copia la URL (ej: https://github.com/usuario/reponame.git)"
    echo "  3. Ejecuta: git remote add origin <URL>"
    echo "  4. Luego: ./scripts/deploy-gh.sh"
    exit 1
fi

remote_url=$(git remote get-url origin)
echo "✅ Remote configurado: $remote_url"

echo ""
echo "== Subiendo cambios =="
branch=$(git branch --show-current)
git push origin "$branch"

echo ""
echo "✅ Cambios en GitHub. Ahora puedes:"
echo "   - Si tienes GitHub Actions configurado, el despliegue automático debería ejecutarse"
echo "   - O ejecutar manualmente: npx wrangler deploy dist/server/wrangler.json"
echo ""
echo "Para configurar despliegue automático (GitHub Actions), crea .github/workflows/deploy.yml con:"
echo "  name: Deploy to Cloudflare"
echo "  on:"
echo "    push:"
echo "      branches: [ master, main ]"
echo "  jobs:"
echo "    deploy:"
echo "      runs-on: ubuntu-latest"
echo "      steps:"
echo "        - uses: actions/checkout@v4"
echo "        - uses: actions/setup-node@v4"
echo "          with:"
echo "            node-version: 22"
echo "        - run: npm ci"
echo "        - run: npm run build"
echo "        - run: npx wrangler deploy dist/server/wrangler.json"
echo "          env:"
echo "            CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}"
