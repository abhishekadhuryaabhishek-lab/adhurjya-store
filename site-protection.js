(function(){
  'use strict';

  var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  document.addEventListener('contextmenu', function(e){
    if (e.target.closest('iframe, ins, .adsbygoogle')) return;
    e.preventDefault();
  }, false);

  document.addEventListener('keydown', function(e){
    if(e.key === 'F12'){ e.preventDefault(); return false; }
    if(e.ctrlKey && e.key.toLowerCase() === 'u'){ e.preventDefault(); return false; }
    if(e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')){ e.preventDefault(); return false; }
    if(e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')){ e.preventDefault(); return false; }
    if(e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')){ e.preventDefault(); return false; }
  }, false);

  var style = document.createElement('style');
  style.textContent = 
    '*{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;-webkit-touch-callout:none;}' +
    'input,textarea,select,button,video,canvas,iframe,[contenteditable="true"]{-webkit-user-select:auto;-moz-user-select:auto;-ms-user-select:auto;user-select:auto;-webkit-touch-callout:default;}';
  document.head.appendChild(style);

  var devtoolsOpen = false;
  var devtoolsTimer = null;
  var overlay = null;

  function createOverlay(){
    if(overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'devtools-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#fff;font-family:system-ui,sans-serif;';
    overlay.innerHTML = '<div style="font-size:24px;font-weight:600;margin-bottom:12px;">Developer tools are disabled on this site.</div><div style="font-size:14px;color:#94a3b8;">Please close DevTools to continue.</div>';
    document.body.appendChild(overlay);
  }

  function removeOverlay(){
    if(overlay && overlay.parentNode){
      overlay.parentNode.removeChild(overlay);
      overlay = null;
    }
  }

  function checkDevTools(){
    var threshold = 160;
    var widthDiff = window.outerWidth - window.innerWidth > threshold;
    var heightDiff = window.outerHeight - window.innerHeight > threshold;
    
    if(widthDiff || heightDiff){
      if(!devtoolsOpen){
        devtoolsOpen = true;
        devtoolsTimer = setTimeout(function(){
          createOverlay();
        }, 3000);
      }
    } else {
      devtoolsOpen = false;
      if(devtoolsTimer){
        clearTimeout(devtoolsTimer);
        devtoolsTimer = null;
      }
      removeOverlay();
    }
  }

  setInterval(checkDevTools, 500);
  window.addEventListener('resize', checkDevTools);

  window.SiteProtection = {
    isMobile: isMobile,
    checkLargeFile: function(fileSize, maxMB){
      maxMB = maxMB || 50;
      if(isMobile && fileSize > maxMB * 1024 * 1024){
        return { warn: true, message: 'For large videos, please use Desktop.' };
      }
      return { warn: false };
    },
    getPreset: function(){
      return isMobile ? 'veryfast' : 'slow';
    }
  };
})();
