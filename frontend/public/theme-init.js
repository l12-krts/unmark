// Follow the system theme before first paint, so there's no light/dark flash.
;(function () {
  var dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  var root = document.documentElement
  root.classList.toggle('dark', dark)
  root.classList.toggle('light', !dark)
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
})()
