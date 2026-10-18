export function createLifecycle({isAlive, onExit}) {
 let owner=null, suspended=false, stopped=false;
 return {
  attach(pid){if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Soundux nao esta aberto');owner=pid;},
  suspend(){suspended=true;},
  resume(){suspended=false;},
  check(){
   if(stopped||suspended||owner===null)return;
   if(!isAlive(owner)){stopped=true;onExit();}
  }
 };
}
