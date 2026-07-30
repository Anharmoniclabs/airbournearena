/* ===================== CHAPTER 5 — THE SKY WAR =====================
   Section 10. The player stops taking assignments and starts choosing where
   the effort goes. Every mission here is a place that can be held or lost.  */

M({chapter:5, id:'ch5_m1', title:'RECLAIM', next:'ch5_m2',
  brief:'A forward base has been taken. Take it back — guns first, then the mast.',
  intro:function(){
    say('MARA','They hold the west field. Guns, mast, the lot.',4);
    say('ARAS','Aras. I have two flights holding the ridge and nothing to spare. '+
      'The field is yours to take.',5);
  },
  objectives:[
    {text:function(){return 'TAKE THE FIELD APART ('+sitesLeft()+' LEFT)';},
     setup:function(){
       for(var i=0;i<3;i++){
         var a=Math.PI*2*i/3+0.5;
         makeSite({at:new THREE.Vector3(-2200+Math.cos(a)*320,0,Math.sin(a)*320),
           kind:'slab',height:70,radius:26,hp:220,guns:true,name:'CAPTURED AA'});
       }
       makeSite({at:new THREE.Vector3(-2200,0,0),kind:'mast',height:150,radius:34,
         hp:360,name:'CAPTURED MAST'});
       for(var k=0;k<4;k++)
         spawnFlier({at:new THREE.Vector3(rnd(-2600,-1600),rnd(650,950),rnd(-900,900)),
           hostile:true,hp:62,speed:110,name:'OCCUPIER'});
     },
     done:function(){return sitesLeft()===0&&hostilesLeft()===0;}},
    {text:'HOLD THE FIELD',
     setup:function(){
       say('MARA','Now stay on it. They will try to come back for it once.',4.2);
       for(var i=0;i<4;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-1200,400),rnd(700,1000),rnd(-1100,1100)),
           hostile:true,hp:60,speed:114,name:'COUNTER'});
     },
     done:function(){return hostilesLeft()===0;}}
  ],
  reward:function(){
    addRep(factionKey(),12); addRep('independent',8);
    addUnity(3); SAVE.credits+=1100;
    SAVE.flags.westField=true;
    say('MARA','West field is ours. That is one region that still has a working mast.',4.6);}});

M({chapter:5, id:'ch5_m2', title:'DOWNED WINGS', next:'ch5_m3',
  brief:'Four pilots are down in contested air, and two of them fly for the wrong team.',
  weather:'storm',
  intro:function(){
    say('MARA','Four beacons. Two are yours. Two are not.',4.2);
    say('ARAS','I am not going to tell you which order to take them in. '+
      'I am going to remember the order you take them in.',5.4);
  },
  objectives:[
    {text:function(){return 'COVER THE RECOVERY FLIGHTS ('+convoyAlive()+'/4 ALIVE)';},
     setup:function(){
       for(var i=0;i<4;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-1600,1600),640+i*30,rnd(-1400,1400)),
           big:true,hp:150,speed:74,name:i<2?'RECOVERY':'RIVAL RECOVERY',
           path:[BREAKWATER.clone()]});
       for(var k=0;k<5;k++)
         spawnFlier({at:new THREE.Vector3(rnd(-1400,1400),rnd(750,1050),rnd(-1400,1400)),
           hostile:true,hp:60,speed:112,name:'HUNTER'});
     },
     fail:function(){return convoyAlive()===0;},
     failText:'All four recovery flights lost. Every one of those beacons went quiet.',
     done:function(){return convoyArrived()||hostilesLeft()===0;}}
  ],
  reward:function(){
    var kept=convoyAlive();
    addUnity(kept>=4?12:kept*2);
    addRep('civilian',kept*2); addRep('independent',8);
    TRUST_KEYS.forEach(function(t){if(t!=='nyx'&&kept>=3)addTrust(t,6);});
    SAVE.credits+=900;
    say('MARA',kept>=4?'You went back for the ones flying the wrong colours. That is going to travel.'
                      :'You got some of them out. It is more than anyone else managed today.',5.4);}});

M({chapter:5, id:'ch5_m3', title:'WARDEN NODES', next:'ch5_m4',
  brief:'The control network has physical nodes. Take enough of them offline and it cannot finish.',
  intro:function(){
    say('MARA','Four nodes, spread wide on purpose so nobody can hit them all at once.',4.6);
    say('MERCER','Four nodes, one aircraft, one night. I have run the numbers and '+
      'I do not like them. Go anyway.',5.4);
  },
  objectives:[
    {text:function(){return 'DESTROY THE WARDEN NODES ('+sitesLeft()+' LEFT)';},
     setup:function(){
       var at=[[-1800,-1600],[1900,-1400],[1700,1500],[-1600,1700]];
       for(var i=0;i<at.length;i++)
         makeSite({at:new THREE.Vector3(at[i][0],0,at[i][1]),kind:'slab',
           height:100,radius:32,hp:300,guns:true,name:'WARDEN NODE'});
       for(var k=0;k<4;k++)
         spawnFlier({at:new THREE.Vector3(rnd(-1800,1800),rnd(750,1050),rnd(-1800,1800)),
           hostile:true,hp:64,speed:114,name:'NODE GUARD'});
     },
     done:function(){return sitesLeft()===0;}}
  ],
  reward:function(){
    addRep('independent',14); addRep('tempest',8); addUnity(6); SAVE.credits+=1400;
    SAVE.flags.nodesDown=true;
    say('MARA','That will slow it. It will not stop it — the carrier is the network now.',5);}});

M({chapter:5, id:'ch5_m4', title:'TASK FORCE', next:'ch6_m1', last:true,
  brief:'Black Wing’s carrier is running for the central sky city. Decide who flies against it.',
  intro:function(){
    say('MARA','The carrier turned for the city an hour ago. Whatever you are going to build, build it now.',5.4);
  },
  objectives:[
    {text:'DECIDE WHO FLIES WITH YOU',
     setup:function(){
       openChoice('THE TASK FORCE',
         'Vanguard, Tempest and Inferno will all send aircraft. They will not '+
         'all take orders from the same person.',
         [{k:'united',label:'ONE JOINT TASK FORCE',
           apply:function(){
             addUnity(20); addRep('vanguard',8); addRep('tempest',8); addRep('inferno',8);
             SAVE.flags.taskforce='united';
             say('VALE','Under an independent. Twenty years ago I would have refused. Go.',5.2);}},
          {k:'faction',label:'LEAD YOUR OWN TEAM',
           apply:function(){
             addUnity(-10); addRep(factionKey(),20);
             SAVE.flags.taskforce='faction';
             say('MARA','Your team, your way. The other two will hold their own line and no more.',5);}}]);
     },
     done:function(){return !!mission.choice;}},
    {text:function(){return 'CLEAR THE CARRIER’S PATH ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       say('MARA','Screen first. They always put the screen out ahead.',3.8);
       for(var i=0;i<7;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-600,1800),rnd(800,1200),rnd(-1400,1400)),
           hostile:true,hp:64,speed:116,name:'SCREEN'});
     },
     done:function(){return hostilesLeft()===0;}}
  ],
  chapterEnd:'The Warden Network went live while you were flying. Navigation, '+
    'drones and half the automated defences across the central regions answer '+
    'to the carrier now.',
  reward:function(){
    addRep('independent',12); SAVE.credits+=1800;
    say('NYX','It is on. Everything is on. Whatever you are going to do, do it fast.',4.8);}});

