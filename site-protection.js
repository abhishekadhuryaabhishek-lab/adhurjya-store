(function(){
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); });

  document.addEventListener('keydown', function(e){
    if(e.key === 'F12') { e.preventDefault(); return false; }
    if(e.ctrlKey && e.key === 'u') { e.preventDefault(); return false; }
    if(e.ctrlKey && e.shiftKey && e.key === 'I') { e.preventDefault(); return false; }
    if(e.ctrlKey && e.shiftKey && e.key === 'i') { e.preventDefault(); return false; }
  });

  var style = document.createElement('style');
  style.textContent = 'html,body,*:not(input):not(textarea):not(select):not(button):not(video):not(canvas){-webkit-user-select:none!important;-moz-user-select:none!important;-ms-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}input,textarea,select,button,video,canvas{-webkit-user-select:auto;-moz-user-select:auto;-ms-user-select:auto;user-select:auto;}';
  document.head.appendChild(style);
})();
