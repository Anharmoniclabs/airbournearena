/* ===================== CHAPTER 2 — THE OPEN SKIES =====================
   Section 10. Black Wing is operating across civilian, criminal and faction
   territory at once, and the player's job stops being "pass the trial" and
   becomes "work the region". Every mission here is built from the three
   primitives — gates, fliers, sites — because section 2.6 asks story missions
   to grow out of systems that already earn their keep in the arena.        */

M({chapter:2, id:'ch2_m1', title:'TOWER RAID', next:'ch2_m2',
  brief:'Black Wing drones are working the Skyway navigation masts. Hold the towers.',
  intro:function(){
    say('MARA','Three navigation masts are being worked over at once. That is not opportunism.',4.6);
    say('MARA','Nobody else is coming. The teams are still arguing about the arena.',4);
  },
  objectives:[
    {text:function(){return 'DRIVE THE DRONES OFF THE MASTS ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       makeSite({at:new THREE.Vector3(-900,0,-1500),kind:'mast',hold:4,holdR:340,name:'MAST NORTH'});
       makeSite({at:new THREE.Vector3(600,0,1600),kind:'mast',hold:4,holdR:340,name:'MAST SOUTH'});
       makeSite({at:new THREE.Vector3(1500,0,-400),kind:'mast',hold:4,holdR:340,name:'MAST EAST'});
       for(var i=0;i<5;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-1200,1600),rnd(650,900),rnd(-1600,1600)),
           hostile:true,hp:54,speed:106,name:'RAIDER'});
     },
     done:function(){return hostilesLeft()===0;}},
    {text:function(){return 'BRING THE MASTS BACK UP ('+sitesWorked()+'/'+sitesToWork()+')';},
     setup:function(){say('MARA','Now fly a slow circuit over each one so the array can re-sync.',4.4);},
     done:function(){return allWorked();}}
  ],
  reward:function(){
    addRep('civilian',12); addRep('independent',10); addUnity(3); SAVE.credits+=700;
    say('MARA','Three masts, one night, three regions apart. Somebody planned that.',5);}});

M({chapter:2, id:'ch2_m2', title:'CONTRACT RUN', next:'ch2_m3',
  brief:'A settlement the teams stopped servicing needs a delivery. Fly the corridor and get the hauler in.',
  intro:function(){
    say('MARA','Ridgemouth has been off the Vanguard supply list for two months.',4.2);
    say('MARA','They pay in goodwill, which is worth more than it sounds.',3.8);
  },
  objectives:[
    {text:function(){return 'FLY THE DELIVERY CORRIDOR ('+(gates.length-gatesLeft())+'/'+gates.length+')';},
     setup:function(){
       var pts=[[-1400,640,-700],[-500,700,-1200],[500,760,-1500],[1300,700,-1100]];
       for(var i=0;i<pts.length;i++)makeGate(pts[i][0],pts[i][1],pts[i][2],72);
     },
     done:function(){return gatesLeft()===0;}},
    {text:function(){return 'ESCORT THE HAULER IN ('+convoyAlive()+' ALIVE)';},
     setup:function(){
       say('CARGO','Hauler is behind you and slow. Keep them off my tail.',3.8);
       spawnFlier({at:new THREE.Vector3(-1600,660,-600),big:true,hp:200,speed:76,name:'HAULER',
         path:[new THREE.Vector3(-300,700,-1200),new THREE.Vector3(1300,700,-1100)]});
       for(var i=0;i<3;i++)
         spawnFlier({at:new THREE.Vector3(rnd(700,1500),rnd(700,950),rnd(-1600,-600)),
           hostile:true,hp:58,speed:104,name:'RAIDER'});
     },
     fail:function(){return convoyAlive()===0;},
     failText:'The hauler is down and Ridgemouth gets nothing. Again.',
     done:function(){return convoyArrived();}}
  ],
  reward:function(){
    addRep('civilian',16); addRep('independent',8); addUnity(3); SAVE.credits+=850;
    SAVE.flags.ridgemouth=true;
    say('MARA','Ridgemouth will remember that. Settlements have long memories.',4.2);}});

M({chapter:2, id:'ch2_m3', title:'FALSE COLOURS', next:'ch2_m4',
  brief:'Unmarked aircraft are flying with stolen team hardware. Take one down and read the wreck.',
  weather:'overcast',
  intro:function(){
    say('MARA','Unmarked flight, no transponder, and it is turning like a Tempest airframe.',4.6);
    say('MARA','If that is Tempest hardware in an unmarked hull, somebody is going to start a war over it.',5);
  },
  objectives:[
    {text:function(){return 'DOWN THE UNMARKED FLIGHT ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       for(var i=0;i<4;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-600,900),rnd(750,1050),rnd(-900,900)),
           hostile:true,hp:64,speed:114,name:'UNMARKED'});
     },
     done:function(){return hostilesLeft()===0;}},
    {text:function(){return 'SCAN THE WRECKAGE ('+sitesWorked()+'/'+sitesToWork()+')';},
     setup:function(){
       say('MARA','Get low and hold over the debris field. The array needs a few seconds.',4.4);
       makeSite({at:new THREE.Vector3(200,0,300),kind:'slab',height:26,radius:22,
         hold:6,holdR:300,name:'WRECK FIELD'});
     },
     done:function(){return allWorked();}}
  ],
  reward:function(){
    addRep('independent',12); addRep('tempest',6); addUnity(2); SAVE.credits+=600;
    SAVE.flags.sawStolenTech=true;
    say('MARA','Vanguard command boards. Tempest engine governors. Inferno power cells. '+
      'All three, in one unmarked hull.',6);}});

M({chapter:2, id:'ch2_m4', title:'SHADE', next:'ch2_m5',
  brief:'Nyx is flying escort over a civilian corridor. Intercept — and watch what they do.',
  intro:function(){
    say('MARA','Shade is up. Same corridor as the evening passenger run.',4);
    say('NYX','You again. Stay off my wing and nobody down there gets hurt.',4.2);
  },
  objectives:[
    {text:function(){return 'INTERCEPT SHADE — KEEP THE LINER ALIVE ('+convoyAlive()+')';},
     setup:function(){
       spawnFlier({at:new THREE.Vector3(-1700,700,400),big:true,hp:240,speed:72,name:'LINER',
         path:[new THREE.Vector3(0,720,300),new THREE.Vector3(1600,680,200)]});
       spawnFlier({at:new THREE.Vector3(1200,860,-300),hostile:true,hp:300,speed:122,name:'NYX'});
       for(var i=0;i<2;i++)
         spawnFlier({at:new THREE.Vector3(rnd(900,1500),rnd(750,950),rnd(-700,700)),
           hostile:true,hp:56,speed:108,name:'ESCORT'});
     },
     fail:function(){return convoyAlive()===0;},
     failText:'The liner is down. Nyx would not even have done that.',
     step:function(){
       if(mission.t>20&&!mission.obj._said){mission.obj._said=true;
         say('NYX','You noticed. I have not fired at the liner once.',4.4);}
     },
     done:function(){return hostilesLeft()===0||convoyArrived();}}
  ],
  reward:function(){
    /* What you did here is the whole point of the mission. Shooting Nyx down
       after watching them hold fire over a liner is a different answer from
       letting them go, and Chapter 6 reads it. */
    var nyx=namedFlier('NYX'), killed=!!nyx&&!nyx.alive, saved=convoyAlive()>0;
    addRep('civilian',saved?10:0);
    if(killed){
      addTrust('nyx',-25); addUnity(-2);
      SAVE.flags.nyxSpared=false;
      say('VEYR','You shot down the only one of mine who still argued with me. '+
        'Thank you.',5.2);
    } else {
      addTrust('nyx',saved?14:6); addUnity(2);
      SAVE.flags.nyxSpared=true;
      say('NYX','Cassian would have shot it down to make a point. I am not Cassian.',5);
    }}});

M({chapter:2, id:'ch2_m5', title:'THE FRAGMENT', next:'ch3_m1', last:true,
  brief:'A Black Wing cache holds a piece of the control architecture. Take it, then decide who gets it.',
  weather:'rain',
  intro:function(){
    say('MARA','Cache site, lightly held, and it is putting out a control signal.',4.4);
  },
  objectives:[
    {text:function(){return 'CLEAR THE CACHE DEFENCES ('+sitesLeft()+' PLATFORMS)';},
     setup:function(){
       makeSite({at:new THREE.Vector3(1400,0,900),kind:'slab',height:90,radius:30,
         hp:280,guns:true,name:'CACHE GUN'});
       makeSite({at:new THREE.Vector3(1750,0,600),kind:'slab',height:90,radius:30,
         hp:280,guns:true,name:'CACHE GUN'});
       for(var i=0;i<3;i++)
         spawnFlier({at:new THREE.Vector3(rnd(1200,1900),rnd(650,900),rnd(400,1100)),
           hostile:true,hp:60,speed:106,name:'GUARD'});
     },
     done:function(){return sitesLeft()===0&&hostilesLeft()===0;}},
    {text:'RECOVER THE WARDEN FRAGMENT',
     setup:function(){
       say('MARA','There it is. Fly it through, same as a Core.',3.6);
       coreGroup.visible=true;
       core.carrier=null; core.lockout=null; core.charge=100;
       core.pos.set(1550,700,760); core.vel.set(0,0,0);
     },
     step:function(){stepCore(1/60);},
     done:function(){return core.carrier===player;}},
    {text:'CARRY IT HOME TO BREAKWATER',
     step:function(){stepCore(1/60);},
     done:function(){return player.pos.distanceTo(BREAKWATER)<420;}},
    {text:'DECIDE WHO GETS THE FRAGMENT',
     setup:function(){
       openChoice('THE WARDEN FRAGMENT',
         'It is control architecture, and it is not finished. Whoever holds it '+
         'holds a piece of whatever Black Wing is building.',
         [{k:'share',label:'SHARE IT WITH ALL THREE TEAMS',
           apply:function(){
             addUnity(14); addRep('vanguard',8); addRep('tempest',8); addRep('inferno',8);
             SAVE.flags.fragment='share';
             say('MARA','All three, at once, in the open. Brave. Possibly stupid.',4.4);}},
          {k:'team',label:'GIVE IT TO YOUR TEAM',
           apply:function(){
             addUnity(-6); addRep(factionKey(),16);
             SAVE.flags.fragment='team';
             say('MARA','Your team will love you for it. The other two will not forget.',4.6);}},
          {k:'hide',label:'HIDE A COPY WITH MARA',
           apply:function(){
             addUnity(4); addRep('independent',16); addRep('civilian',6);
             SAVE.flags.fragment='hide';
             say('MARA','In my floor, under the compressor. Nobody looks under a compressor.',4.6);}}]);
     },
     done:function(){return !!mission.choice;}}
  ],
  chapterEnd:'You are a known quantity now. All three teams want to see how you '+
    'fly against their best.',
  reward:function(){
    addRep('independent',10); SAVE.credits+=1400;
    say('MARA','Whatever that thing is part of, it needs all three teams to build it. '+
      'Think about what that means.',6);}});

