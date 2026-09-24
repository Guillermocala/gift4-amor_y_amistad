import { defineConfig } from 'vite'

// GitHub Actions define GITHUB_REPOSITORY como owner/repo, asi que el base path de Pages
// sale del propio nombre del repositorio y renombrarlo no rompe las rutas de los assets.
// El literal de reserva mantiene el mismo base en local, para no divergir del publicado.
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'gift4-amor_y_amistad'

export default defineConfig({
  base: `/${repository}/`,
})
