// middleware/auth.ts
export default defineNuxtRouteMiddleware((to) => {
  const token = useCookie('directus_token')

  if (!token.value && to.path !== '/login') {
    return navigateTo('/login')
  }

  if (token.value && to.path === '/login') {
    return navigateTo('/')
  }
})