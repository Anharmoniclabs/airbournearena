/* ===================== CHAPTER 6 — WINGS UNITED =====================
   Section 10, the final sequence, flown in the order the bible lists it. The
   ending is chosen by the player and gated by what the campaign has actually
   recorded — unity, allied aces, civilian standing, Nyx.                   */

M({chapter:6, id:'ch6_m1', title:'THE CITY', next:'ch6_m2',
  brief:'Defend the central sky city while its own systems fight it.',
  weather:'storm',
  intro:function(){
    say('MARA','The city is flying blind. Its own defences are shooting at its own traffic.',5);
    say('CALDER','Inferno has the southern approach. Take the north and we will not '+
      'have to talk about who is in charge.',5.6);
  },
  objectives:[
    {text:function(){return 'BREAK THE FIRST WAVE ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       for(var i=0;i<6;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-1200,1200),rnd(800,1200),rnd(-1400,-600)),
           hostile:true,hp:62,speed:116,name:'WARDEN DRONE'});
     },
     done:function(){return hostilesLeft()===0;}},
    {text:function(){return 'BREAK THE SECOND WAVE ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       say('MARA','Another wave. They are being fed straight off the network.',4.2);
       for(var i=0;i<7;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-1400,1400),rnd(850,1250),rnd(600,1500)),
           hostile:true,hp:66,speed:118,name:'WARDEN DRONE'});
     },
     done:function(){return hostilesLeft()===0;}},
    {text:function(){return 'GET THE CIVILIAN TRAFFIC OUT ('+convoyAlive()+' ALIVE)';},
     setup:function(){
       say('MARA','Three passenger hulls still up there with no navigation. Walk them out.',4.8);
       for(var i=0;i<3;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-500,500),700+i*40,rnd(-400,400)),
           big:true,hp:170,speed:76,name:'CITY TRAFFIC',path:[BREAKWATER.clone()]});
       for(var k=0;k<3;k++)
         spawnFlier({at:new THREE.Vector3(rnd(-1200,1200),rnd(800,1100),rnd(-1200,1200)),
           hostile:true,hp:62,speed:116,name:'WARDEN DRONE'});
     },
     fail:function(){return convoyAlive()===0;},
     failText:'All three passenger hulls are gone. That is what the network was for.',
     done:function(){return convoyArrived();}}
  ],
  reward:function(){
    addRep('civilian',18); addRep('vanguard',8); addRep('inferno',8);
    addUnity(8); SAVE.credits+=1600;
    SAVE.flags.cityHeld=convoyAlive()>0;
    say('VALE','The city is still up there. Say what you like about the three of us — '+
      'nobody flew home tonight.',5.4);}});

M({chapter:6, id:'ch6_m2', title:'LIGHTS ON', next:'ch6_m3',
  brief:'The Warden Network only works because it is the only navigation left. Bring the independent masts back.',
  intro:function(){
    say('MARA','Independent masts. Old, stubborn, and not on their network.',4.4);
    say('KADE','Tempest built half of those and then got told they were obsolete. '+
      'Light them up.',5.2);
    say('MARA','Fly a slow circuit over each one and they will come up on their own.',4.4);
  },
  objectives:[
    {text:function(){return 'RESTORE THE INDEPENDENT MASTS ('+sitesWorked()+'/'+sitesToWork()+')';},
     setup:function(){
       var at=[[-2100,-1200],[0,-2000],[2100,-900],[1200,1800],[-1400,1600]];
       for(var i=0;i<at.length;i++)
         makeSite({at:new THREE.Vector3(at[i][0],0,at[i][1]),kind:'mast',
           height:150,radius:30,hold:5,holdR:360,name:'MAST '+(i+1)});
       for(var k=0;k<4;k++)
         spawnFlier({at:new THREE.Vector3(rnd(-1800,1800),rnd(750,1100),rnd(-1800,1800)),
           hostile:true,hp:62,speed:114,name:'WARDEN DRONE'});
     },
     done:function(){return allWorked();}}
  ],
  reward:function(){
    addRep('civilian',14); addRep('independent',16); addRep('tempest',8);
    addUnity(8); SAVE.credits+=1200;
    SAVE.flags.mastsUp=true;
    say('MARA','Five masts, all independent, all live. The sky has its own eyes again.',5);}});

M({chapter:6, id:'ch6_m3', title:'THE CORRIDOR', next:'ch6_m4',
  brief:'The carrier sits behind a storm corridor and a defence line. Fly one, break the other.',
  weather:'storm',
  intro:function(){
    say('MERCER','Mercer. I have flown this corridor twice and I would not recommend it once.',5);
  },
  objectives:[
    {text:function(){return 'FLY THE STORM CORRIDOR ('+(gates.length-gatesLeft())+'/'+gates.length+')';},
     setup:function(){
       var pts=[[-1800,700,-1600],[-1000,620,-1900],[0,560,-2100],[900,600,-1900],
                [1600,680,-1500],[2100,760,-900]];
       for(var i=0;i<pts.length;i++)makeGate(pts[i][0],pts[i][1],pts[i][2],66);
     },
     done:function(){return gatesLeft()===0;}},
    {text:function(){return 'DESTROY THE DEFENCE PLATFORMS ('+sitesLeft()+' LEFT)';},
     setup:function(){
       say('MARA','Platforms. They are the carrier’s outer ring — nothing gets past them.',4.6);
       var at=[[2300,-1200],[2500,-500],[2300,300]];
       for(var i=0;i<at.length;i++)
         makeSite({at:new THREE.Vector3(at[i][0],900,at[i][1]),flying:true,kind:'slab',
           height:110,radius:38,hp:340,guns:true,name:'DEFENCE PLATFORM'});
       for(var k=0;k<4;k++)
         spawnFlier({at:new THREE.Vector3(rnd(1800,2600),rnd(850,1200),rnd(-1400,600)),
           hostile:true,hp:66,speed:118,name:'PLATFORM GUARD'});
     },
     done:function(){return sitesLeft()===0;}}
  ],
  reward:function(){
    addRep('tempest',10); addTrust('mercer',8); addUnity(4); SAVE.credits+=1500;
    say('MERCER','You flew it clean. I am putting that in writing where Kade can see it.',5);}});

M({chapter:6, id:'ch6_m4', title:'THE CARRIER', next:'ch6_m5',
  brief:'Engines, drone bays, command relays. In that order.',
  weather:'storm',
  intro:function(){
    say('VEYR','You are inside my ship’s envelope. That is not the achievement you think it is.',5);
    say('SERRANO','Serrano. I am on your wing and I am not asking permission. '+
      'Call the engines first.',5.2);
  },
  objectives:[
    {text:function(){return 'KILL THE ENGINES ('+sitesLeft()+' SECTIONS LEFT)';},
     setup:function(){
       makeSite({at:new THREE.Vector3(2600,880,-260),flying:true,kind:'slab',height:120,
         radius:40,hp:420,guns:true,name:'CARRIER ENGINE'});
       makeSite({at:new THREE.Vector3(2600,880,260),flying:true,kind:'slab',height:120,
         radius:40,hp:420,guns:true,name:'CARRIER ENGINE'});
     },
     done:function(){return sitesLeft()===0;}},
    {text:function(){return 'KILL THE DRONE BAYS ('+sitesLeft()+' LEFT)';},
     setup:function(){
       say('VEYR','Launch everything.',2.4);
       makeSite({at:new THREE.Vector3(2900,900,-160),flying:true,kind:'slab',height:100,
         radius:36,hp:360,guns:true,name:'DRONE BAY'});
       makeSite({at:new THREE.Vector3(2900,900,160),flying:true,kind:'slab',height:100,
         radius:36,hp:360,guns:true,name:'DRONE BAY'});
       for(var i=0;i<6;i++)
         spawnFlier({at:new THREE.Vector3(rnd(2400,3000),rnd(850,1150),rnd(-600,600)),
           hostile:true,hp:60,speed:118,name:'WARDEN DRONE'});
     },
     done:function(){return sitesLeft()===0;}},
    {text:function(){return 'KILL THE COMMAND RELAYS ('+sitesLeft()+' LEFT)';},
     setup:function(){
       makeSite({at:new THREE.Vector3(3150,960,0),flying:true,kind:'mast',height:130,
         radius:32,hp:400,guns:true,name:'COMMAND RELAY'});
     },
     done:function(){return sitesLeft()===0;}}
  ],
  reward:function(){
    addRep('independent',16); addRep('inferno',8); addUnity(6); SAVE.credits+=2000;
    addTrust('serrano',6);
    SAVE.flags.carrierCrippled=true;
    say('VEYR','You have taken my engines. You have not taken the network. '+
      'It does not need me any more than it needs you.',6);}});

M({chapter:6, id:'ch6_m5', title:'THE WARDEN CORE', next:null, last:true,
  brief:'Nyx, then Cassian, then the core. Then get off the ship.',
  weather:'storm',
  start:new THREE.Vector3(2400,900,0),
  intro:function(){
    say('NYX','I am on the bow. You knew I would be.',3.8);
  },
  objectives:[
    {text:'MEET NYX',
     setup:function(){
       /* Section 10: fight Nyx or fly beside them, decided by what the player
          actually did in Chapters 2 and 3 rather than by a menu here. */
       if(SAVE.trust.nyx>=10&&SAVE.flags.nyxSpared){
         say('NYX','I am not going to fight you. I never was.',4);
         say('NYX','Cassian is on the command deck. I will hold the bay doors.',4.4);
         SAVE.flags.nyxAlly=true;
       } else {
         say('NYX','You never gave me a reason to do anything else.',4);
         spawnFlier({at:new THREE.Vector3(3000,950,0),hostile:true,hp:380,speed:124,name:'NYX'});
         SAVE.flags.nyxAlly=false;
       }
     },
     done:function(){return SAVE.flags.nyxAlly?mission.t>6:hostilesLeft()===0;}},
    {text:function(){return 'REACH CASSIAN ('+hostilesLeft()+' IN THE WAY)';},
     setup:function(){
       say('VEYR','Everything you have proved about me is true. It is also beside the point.',5.2);
       say('VEYR','Somebody was always going to build this. I would rather it was somebody who has flown.',5.6);
       for(var i=0;i<5;i++)
         spawnFlier({at:new THREE.Vector3(rnd(2800,3400),rnd(880,1150),rnd(-500,500)),
           hostile:true,hp:66,speed:120,name:'NOCTURNE'});
     },
     done:function(){return hostilesLeft()===0;}},
    {text:function(){return 'DISABLE THE WARDEN CORE ('+sitesWorked()+'/'+sitesToWork()+')';},
     setup:function(){
       say('MARA','Hold station over the core. Do not let anything push you off it.',4.4);
       makeSite({at:new THREE.Vector3(3300,940,0),flying:true,kind:'mast',height:140,
         radius:34,hold:10,holdR:340,name:'WARDEN CORE'});
       for(var i=0;i<3;i++)
         spawnFlier({at:new THREE.Vector3(rnd(3000,3600),rnd(900,1150),rnd(-600,600)),
           hostile:true,hp:62,speed:118,name:'WARDEN DRONE'});
     },
     done:function(){return allWorked();}},
    {text:'GET CLEAR — THE CARRIER IS COMING DOWN',
     setup:function(){
       say('MARA','It is losing height. Get west and do not look back.',4);
       banner('CARRIER GOING DOWN',2.4);
     },
     done:function(){return player.pos.x<600;}},
    {text:'DECIDE WHAT HAPPENS TO THE NETWORK',
     setup:function(){
       var opts=[
         {k:'council',label:'JOINT CIVILIAN COUNCIL',
          apply:function(){addUnity(14);addRep('civilian',14);}},
         {k:'faction',label:'GIVE IT TO YOUR TEAM',
          apply:function(){addRep(factionKey(),20);addUnity(-8);}},
         {k:'break',label:'BREAK IT APART',
          apply:function(){addRep('independent',20);addRep('civilian',10);}},
         {k:'limited',label:'KEEP A LIMITED EMERGENCY NETWORK',
          apply:function(){addUnity(6);addRep('independent',10);}}];
       openChoice('THE WARDEN CORE IS YOURS',
         'It works. That is the problem. Whoever holds it decides who flies, '+
         'and every one of these choices is somebody’s idea of safe.',opts);
     },
     done:function(){return !!mission.choice;}}
  ],
  finale:function(){return decideEnding(mission.choice);},
  reward:function(){
    SAVE.flags.chapter6=true;
    SAVE.credits+=3000;
    addRep('independent',10);}});

/* Section 18.2. The ending is picked from what the campaign recorded, with the
   final choice as the strongest single signal — a player who spent the whole
   campaign sharing evidence and protecting settlements is not handed a faction
   ending for one button press, and a player who never did cannot buy United
   Skies with one either. */
function decideEnding(choice){
  SAVE.ending=choice||'limited'; saveGame();
  var unity=SAVE.unity, aces=alliedAces(), civ=SAVE.rep.civilian,
      team=PILOT.team==='blue'?'VANGUARD':'INFERNO';
  if(SAVE.flags.ledger==='veyr'&&SAVE.rep.blackwing>=20&&choice==='faction')
    return {title:'THE QUIET SKY',
      text:'The network survives, and so does the arrangement that built it. '+
        'Traffic moves on time. Nobody files a complaint, because the system '+
        'that would hear it is the system that would be complained about. You '+
        'are the most trusted pilot in a sky that no longer asks anyone’s '+
        'permission — including yours.'};
  if(choice==='break')
    return {title:'INDEPENDENT SKYWAYS',
      text:'The Warden architecture comes apart into a hundred local agreements '+
        'and not one central authority. The Skyways are slower, patchier and '+
        'harder to abuse. Breakwater Field runs the northern coalition out of '+
        'Mara’s office, which she claims to resent. The three teams are '+
        'still powerful. They are no longer the only ones who decide.'};
  if(choice==='council'&&unity>=40&&aces>=2)
    return {title:'UNITED SKIES',
      text:'Vanguard, Tempest and Inferno stay distinct and sit on the same '+
        'council, with civilian seats they cannot outvote. You are its first '+
        'field commander, which everyone involved finds slightly ridiculous and '+
        'nobody contests. '+(SAVE.flags.nyxAlly
          ?'Nyx testifies, serves eighteen months, and flies again.'
          :'Nyx’s name is on the memorial with the rest of them.')};
  if(choice==='council')
    return {title:'A COUNCIL, OF SORTS',
      text:'The council forms, and it argues. Without the trust to back it, it '+
        'is three delegations watching each other across a table and one '+
        'independent trying to keep the floor. It holds — barely, and only '+
        'because the alternative is still burning on the seabed.'};
  if(choice==='faction')
    return {title:team+' ASCENDANCY',
      text:team==='VANGUARD'
        ? 'Vanguard takes primary responsibility for airspace security. The '+
          'skies get measurably safer and measurably more watched. You are the '+
          'best-known pilot in the service, which makes you the one person who '+
          'can still argue with it from the inside.'
        : 'Inferno secures the major routes through sheer deterrence. Attacks '+
          'fall away almost overnight. Strength becomes the language the whole '+
          'region negotiates in, and you spend the rest of your career deciding '+
          'what that strength is pointed at.'};
  return {title:'A LIMITED NETWORK',
    text:'What survives is an emergency system under independent oversight — '+
      'small, auditable, and switched off by default. It is nobody’s '+
      'victory and everybody’s compromise, which is why it lasts. '+
      (civ>=40?'The settlements that were written off vote to fund it first.'
              :'The settlements watch it carefully, and say nothing yet.')};
}

