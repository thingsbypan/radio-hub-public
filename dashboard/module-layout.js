(() => {
  const main = document.querySelector('body > main');
  const existing = main.querySelector(':scope > nav');
  const tabs = EchoFramework.tabs(document.body.dataset.module);
  if (existing) existing.replaceWith(tabs);
  else main.prepend(tabs);
  main.querySelector(':scope > header').classList.add('module-header');
  lucide.createIcons();
  window.dispatchEvent(new Event('resize'));
})();
