/* --- Phase 2: First Flight --- */
M({chapter:1, id:'ch1_m1', title:'FIRST FLIGHT', next:'ch1_m2',
  brief:'Take the Kestrel up, run the navigation gates, and put rounds on the practice drones.',
  intro:function(){
    say('MARA','Kestrel is fuelled. Take her up and stay off my roof.',3.6);
    say('MARA','Gates first. They are lit teal — fly through the live one.',4);
  },
  objectives:[
    {text:'FLY THE NAVIGATION GATES',
     setup:function(){
       var pts=[[-1900,620,-260],[-1400,700,260],[-900,780,-200],[-500,720,240],[-150,660,0]];
       for(var i=0;i<pts.length;i++)makeGate(pts[i][0],pts[i][1],pts[i][2],70);
     },
     text2:'', done:function(){return gatesLeft()===0;},
     step:function(){}},
    {text:'DESTROY THE PRACTICE DRONES',
     setup:function(){
       say('MARA','Good. Now the drones — they shoot back, but softly.',3.6);
       for(var i=0;i<3;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-900,-300),rnd(600,820),rnd(-500,500)),
           hostile:true,hp:40,speed:88,name:'DRONE'});
     },
     done:function(){return hostilesLeft()===0;}},
    {text:'RETURN TO BREAKWATER FIELD',
     setup:function(){say('MARA','That will do. Bring her home.',3.2);},
     done:function(){return player.pos.distanceTo(BREAKWATER)<420;}}
  ],
  reward:function(){addRep('independent',6);addRep('civilian',3);SAVE.credits+=250;
    say('MARA','Not bad for a first sortie.',3.2);}});

/* --- Phase 3: Distress Call --- */
M({chapter:1, id:'ch1_m2', title:'DISTRESS CALL', next:'ch1_m3',
  brief:'A cargo aircraft is under attack. Drive off the drones, recover the dropped Flight Core, and walk it home.',
  intro:function(){
    say('MARA','Mayday on the open channel. Cargo hauler, east of you.',3.8);
    say('CARGO','We are hit — they came out of the cloud deck!',3.4);
  },
  objectives:[
    {text:'DRIVE OFF THE ATTACKING DRONES',
     setup:function(){
       spawnFlier({at:new THREE.Vector3(400,760,300),big:true,hp:220,speed:74,name:'HAULER',
         path:[new THREE.Vector3(-600,700,120),new THREE.Vector3(-1600,600,40),BREAKWATER.clone()]});
       for(var i=0;i<3;i++)
         spawnFlier({at:new THREE.Vector3(rnd(500,900),rnd(700,900),rnd(-300,600)),
           hostile:true,hp:52,speed:100,name:'RAIDER'});
     },
     fail:function(){return convoyAlive()===0;},
     failText:'The hauler is down. We needed that crew.',
     done:function(){return hostilesLeft()===0;}},
    {text:'RECOVER THE FLIGHT CORE',
     setup:function(){
       say('CARGO','We dumped the Flight Core when the hull went. It is below you.',4);
       coreGroup.visible=true;
       core.carrier=null; core.lockout=null; core.charge=100;
       core.pos.set(player.pos.x+rnd(-200,200),700,player.pos.z+rnd(-200,200));
       core.vel.set(0,0,0);
       wxKey='rain'; wxTimer=200;   /* the storm front closes in (section 11) */
       say('MARA','Storm front is closing. Move.',3.2);
     },
     step:function(){stepCore(1/60);},
     done:function(){return core.carrier===player;}},
    {text:'ESCORT THE HAULER TO BREAKWATER',
     setup:function(){say('CARGO','Staying on your wing. Take us in.',3.2);},
     step:function(){stepCore(1/60);},
     fail:function(){return convoyAlive()===0;},
     failText:'The hauler is down. We needed that crew.',
     done:function(){return convoyArrived();}}
  ],
  reward:function(){addRep('civilian',14);addRep('independent',8);SAVE.credits+=900;
    SAVE.flags.rescuedHauler=true;
    say('MARA','That recording is already on three team channels. Brace yourself.',4.2);}});

/* --- Mission 3: Recognition --- */
M({chapter:1, id:'ch1_m3', title:'RECOGNITION', next:'ch1_m4',
  brief:'All three teams have seen the rescue. Hear them out.',
  intro:function(){
    say('MARA','Three calls in an hour. That is a record for my strip.',3.6);
    say('VALE','Vanguard. You held station over a civilian hull. That is our work.',4.4);
    say('KADE','Tempest. You flew a storm front in a museum piece. I like you already.',4.4);
    say('CALDER','Inferno. You did not run. Come see what real guns feel like.',4.2);
    say('MARA','Fly all three trials before you sign anything. Understood?',4);
  },
  objectives:[
    {text:'LISTEN TO ALL THREE OFFERS', done:function(){return !radioBusy();}}
  ],
  reward:function(){SAVE.flags.invited=true;}});

/* --- Phase 4: the three trials --- */
M({chapter:1, id:'ch1_m4', title:'VANGUARD TRIAL — HOLD THE LINE', next:'ch1_m5',
  brief:'Escort three transports. You are scored on survivors, not kills.',
  intro:function(){
    say('ARAS','Aras. Bulwark. Stay with the transports and we will get along.',4);
  },
  objectives:[
    {text:function(){return 'PROTECT THE TRANSPORTS ('+convoyAlive()+'/3 ALIVE)';},
     setup:function(){
       var dest=new THREE.Vector3(1500,640,0);
       for(var i=0;i<3;i++)
         spawnFlier({at:new THREE.Vector3(-1500,660+i*40,(i-1)*130),big:true,hp:150,speed:80,
           name:'TRANSPORT',path:[new THREE.Vector3(-300,660,(i-1)*130),dest.clone().setZ((i-1)*130)]});
       for(var k=0;k<4;k++)
         spawnFlier({at:new THREE.Vector3(rnd(600,1300),rnd(700,900),rnd(-600,600)),
           hostile:true,hp:48,speed:104,name:'RAIDER'});
     },
     fail:function(){return convoyAlive()===0;},
     failText:'All three transports lost. That is the one score that matters.',
     done:function(){return convoyArrived();}}
  ],
  reward:function(){
    var kept=convoyAlive();
    SAVE.trials.vanguard=kept;
    addRep('vanguard',6+kept*3); addRep('civilian',kept*2);
    say('ARAS',kept>=3?'All three home. Textbook.':'You brought some of them back. Some.',4);
    say('VALE','Guardian Field is what we would put on your aircraft. Think on it.',4.2);}});

M({chapter:1, id:'ch1_m5', title:'TEMPEST TRIAL — CUT THE STORM', next:'ch1_m6',
  brief:'Race the canyon line. Kai Mercer is already out there.',
  intro:function(){
    say('MERCER','Mercer. Crosswind. Try not to redecorate the ridge.',3.8);
    wxKey='overcast'; wxTimer=200;
  },
  objectives:[
    {text:function(){return 'RACE THE CANYON GATES ('+(gates.length-gatesLeft())+'/'+gates.length+')';},
     setup:function(){
       /* the three cut passes through the spine are the race line */
       var pts=[[-1200,560,900],[-600,520,900],[0,480,900],[600,520,0],
                [0,500,-900],[-600,540,-900],[-1300,620,-300]];
       for(var i=0;i<pts.length;i++)makeGate(pts[i][0],pts[i][1],pts[i][2],62);
       spawnFlier({at:new THREE.Vector3(-1250,600,880),hp:400,speed:118,name:'MERCER',tint:0x6fe3d0,
         path:[new THREE.Vector3(-600,520,900),new THREE.Vector3(0,480,900),
               new THREE.Vector3(600,520,0),new THREE.Vector3(0,500,-900),
               new THREE.Vector3(-1300,620,-300)]});
     },
     step:function(){
       if(mission.t>14&&!mission.obj._nag){mission.obj._nag=true;
         say('MERCER','You are flying it like a checklist. Move!',3.4);}
     },
     done:function(){return gatesLeft()===0;}}
  ],
  reward:function(){
    var t=Math.round(mission.t);
    SAVE.trials.tempest=t;
    addRep('tempest',12);
    say('MERCER',t<70?'Alright. That was actually flying.':'You finished. Slowly.',3.8);
    say('KADE','Velocity Burst would suit you. Come and take it.',3.8);}});

M({chapter:1, id:'ch1_m6', title:'INFERNO TRIAL — TRIAL BY FIRE', next:'ch1_m7',
  brief:'Two waves, then Serrano. Manage your heat.',
  intro:function(){
    say('CALDER','Calder. Targets first, then my champion. No cease signal games.',4.2);
    wxKey='fair'; wxTimer=200;
  },
  objectives:[
    {text:function(){return 'DESTROY THE COMBAT WAVE ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       for(var i=0;i<5;i++)
         spawnFlier({at:new THREE.Vector3(rnd(900,1600),rnd(600,900),rnd(-700,700)),
           hostile:true,hp:56,speed:98,name:'TARGET'});
     },
     done:function(){return hostilesLeft()===0;}},
    {text:'DUEL NIKO "CINDER" SERRANO',
     setup:function(){
       say('SERRANO','Serrano. Let us see what the coast taught you.',3.6);
       spawnFlier({at:new THREE.Vector3(1400,780,0),hostile:true,hp:260,speed:112,name:'SERRANO'});
     },
     done:function(){return hostilesLeft()===0;}}
  ],
  reward:function(){
    SAVE.trials.inferno=Math.round(player.hp);
    addRep('inferno',14);
    say('SERRANO','You did not flinch. That buys you a conversation.',3.8);
    say('CALDER','Weapons Overdrive. It is yours if you sign.',3.6);}});

/* --- Phase 5: identity --- */
M({chapter:1, id:'ch1_m7', title:'CHOOSE YOUR WINGS', next:'ch1_m8',
  brief:'Fly back to Breakwater Field and sign with a team.',
  /* The trial you just flew was Inferno's, out east — so the flight home is a
     real leg. Starting at Breakwater made "return to Breakwater" true on the
     first frame and the objective was skipped before it was read. */
  start:new THREE.Vector3(2100,760,600),
  intro:function(){
    say('CALDER','That is the last of the three. Go home and think.',3.8);
    say('MARA','Three offers on my table. Come back and choose your own way.',4.2);
  },
  objectives:[
    {text:function(){
       return 'RETURN TO BREAKWATER FIELD — '+
         (player.pos.distanceTo(BREAKWATER)/1000).toFixed(1)+' KM';},
     done:function(){return player.pos.distanceTo(BREAKWATER)<420;}},
    {text:'SIGN WITH A TEAM IN THE HANGAR',
     setup:function(){
       say('MARA','Walk the hangar, or open FIT OUT. Vanguard, Tempest or Inferno.',4.6);
       say('MARA','Tempest do not run an Arena card, so you would fly the west '+
         'flight with them. It changes nothing about who you answer to.',5.4);
       toCampaignHangar();
     },
     done:function(){return !!PILOT.signed&&!!PILOT.faction&&st.phase!=='hangar';}}
  ],
  reward:function(){
    addRep(factionKey(),12);
    SAVE.loadout.power={vanguard:'guardian',tempest:'velocity',inferno:'overdrive'}[factionKey()];
    SAVE.flags.signed=factionKey(); saveGame();}});

M({chapter:1, id:'ch1_m8', title:'BUILT, NOT GIVEN', next:'ch1_m9',
  brief:'Fit the aircraft out. Every choice costs something.',
  intro:function(){say('MARA','Now build it. Nothing here is free — read the trade.',4);},
  objectives:[
    {text:'CONFIGURE YOUR AIRCRAFT IN THE HANGAR',
     setup:function(){toCampaignHangar();},
     done:function(){return st.phase!=='hangar';}}
  ],
  reward:function(){applyLoadout();say('MARA','She is yours now. Go and prove it.',3.6);}});

/* --- Phase 6: arena and attack --- */
M({chapter:1, id:'ch1_m9', title:'FIRST ARENA CORE MATCH', next:'ch1_m10',
  brief:'Your league debut. Deliver the Arena Core.',
  intro:function(){say('ANNOUNCER','New name on the card tonight. Let us see it fly.',4);},
  objectives:[
    {text:'WIN THE ARENA CORE MATCH',
     setup:function(){
       parkArena(false);
       st.mode='arena';
       resetMatch();
     },
     done:function(){return st.over;}}
  ],
  reward:function(){
    var won=(player.team==='blue'?st.scoreB>st.scoreR:st.scoreR>st.scoreB);
    addRep(player.team==='blue'?'vanguard':'inferno',won?10:4);
    SAVE.flags.debut=won?'win':'loss';}});

M({chapter:1, id:'ch1_m10', title:'BLACKOUT', next:'ch2_m1', last:true,
  brief:'The arena has lost power. Something is in the airspace that should not be.',
  intro:function(){
    say('ANNOUNCER','We have lost the arena feed — stand by —',2.8);
    say('MARA','That is not a fault. Get airborne.',3);
  },
  objectives:[
    {text:'ENGAGE THE UNMARKED AIRCRAFT',
     setup:function(){
       for(var i=0;i<4;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-800,800),rnd(900,1200),rnd(-900,900)),
           hostile:true,hp:60,speed:112,name:'BLACK WING'});
       say('NYX','You are not the one I came for.',3.4);
     },
     done:function(){return hostilesLeft()<=1;}},
    {text:'CHOOSE — PURSUE NYX, OR COVER THE SHUTTLE',
     setup:function(){
       say('MARA','Civilian shuttle is holed and dropping. Nyx is running for the storm.',4.4);
       spawnFlier({at:new THREE.Vector3(300,700,600),big:true,hp:90,speed:66,name:'SHUTTLE',
         path:[BREAKWATER.clone()]});
       openChoice('THE SHUTTLE IS FALLING',
         'Nyx escapes either way. Only one of these you can still change.',
         [{k:'shuttle',label:'COVER THE SHUTTLE'},{k:'pursue',label:'PURSUE NYX'}]);
     },
     done:function(){return !!mission.choice;}},
    {text:function(){return mission.choice==='shuttle'?'ESCORT THE SHUTTLE HOME':'RUN NYX DOWN';},
     setup:function(){
       if(mission.choice==='shuttle'){
         say('MARA','Good. Let the ace go.',3.2);
         SAVE.flags.savedShuttle=true; addRep('civilian',16); addRep('independent',8);
         addTrust('nyx',8);
       } else {
         say('NYX','Brave. Pointless.',3);
         SAVE.flags.savedShuttle=false; addRep('blackwing',10);
         /* chasing an ace instead of a falling civilian hull is exactly the
            thing Nyx left Black Wing's inner circle over */
         addTrust('nyx',-12);
         for(var i=0;i<convoy.length;i++)if(convoy[i].passive)convoy[i].alive=false;
       }
       wxKey='storm'; wxTimer=240;
     },
     done:function(){
       if(mission.choice==='shuttle')return convoyArrived()||convoyAlive()===0;
       return mission.t>16;
     }}
  ],
  chapterEnd:'The three teams are accusing each other of the security failure. '+
    'Mara is sending you out over the wider region to find what the stolen '+
    'technology is being used for.',
  reward:function(){
    SAVE.flags.chapter1=true;
    addUnity(2);
    say('NYX','Tell them it was one of their own.',3.6);
    say('MARA','That attack was not meant to win. It was meant to make all three teams '+
      'look at each other instead of the sky.',6.5);}});

