/* Same-origin entry point; recovery fragments stay in the browser. */
(function(){'use strict';const target=new URL('./web/index.html',location.href);target.search=location.search;target.hash=location.hash;location.replace(target.href);})();
