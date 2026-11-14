(function(){
  var figs=[].slice.call(document.querySelectorAll(".shot"));
  var reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduce||!("IntersectionObserver" in window)){
    figs.forEach(function(f){f.classList.add("in")});
    return;
  }
  var seen={},next=0,busy=false;
  // reveal strictly in DOM order: a figure waits until all earlier ones are revealed
  function pump(){
    if(busy){return}
    while(next<figs.length&&seen[next]){
      busy=true;
      figs[next].classList.add("in");
      next++;
      setTimeout(function(){busy=false;pump()},180);
      return;
    }
  }
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){
      if(e.isIntersecting){
        seen[figs.indexOf(e.target)]=true;
        io.unobserve(e.target);
      }
    });
    pump();
  },{threshold:.2,rootMargin:"0px 0px -8% 0px"});
  figs.forEach(function(f){io.observe(f)});
})();
