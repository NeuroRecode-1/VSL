class DCLogic {
  renderVals() {
    return {};
  }
}

(function bootDcScripts() {
  function mount() {
    document.querySelectorAll('script[data-dc-script]').forEach((script, index) => {
      try {
        const ComponentClass = new Function(
          'DCLogic',
          script.textContent + '\nreturn Component;'
        )(DCLogic);
        const instance = new ComponentClass();
        const vals = instance.renderVals ? instance.renderVals() : {};

        Object.keys(vals || {}).forEach((key) => {
          if (!(key in window)) {
            window[key] = vals[key];
          }
        });

        if (instance.componentDidMount) {
          instance.componentDidMount();
        }
      } catch (error) {
        console.error('Failed to mount exported page script #' + (index + 1), error);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
