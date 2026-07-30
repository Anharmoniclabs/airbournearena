/* ===================== CHAPTER 3 — RIVAL ACES =====================
   Section 10 and 17.3. Trust moves on decisions, not on repetition: each ace
   gets one mission that tests the thing they actually care about, and the
   chapter closes on a choice about which of them you cover.               */

M({chapter:3, id:'ch3_m1', title:'HOLD WITH ARAS', next:'ch3_m2',
  brief:'Lena Aras is running a civilian evacuation into contested air. She wants a wing, not a hero.',
  intro:function(){
    say('ARAS','Aras. Four transports, one corridor, and I am not losing any of them.',4.6);
    say('ARAS','Kills are yours if you want them. Survivors are mine.',4);
  },
  objectives:[
    {text:function(){return 'HOLD THE EVACUATION ('+convoyAlive()+'/4 ALIVE)';},
     setup:function(){
       var dest=new THREE.Vector3(-1900,620,0);
       for(var i=0;i<4;i++)
         spawnFlier({at:new THREE.Vector3(1500,640+i*40,(i-1.5)*160),big:true,hp:160,speed:78,
           name:'EVAC',path:[new THREE.Vector3(200,660,(i-1.5)*160),
                             dest.clone().setZ((i-1.5)*160)]});
       for(var k=0;k<5;k++)
         spawnFlier({at:new THREE.Vector3(rnd(-1600,600),rnd(700,950),rnd(-800,800)),
           hostile:true,hp:58,speed:108,name:'RAIDER'});
     },
     fail:function(){return convoyAlive()===0;},
     failText:'All four gone. Aras will not say a word about it, which is worse.',
     done:function(){return convoyArrived();}}
  ],
  reward:function(){
    var kept=convoyAlive();
    SAVE.trials.aras=kept;
    addTrust('aras',kept>=4?22:(kept>=2?10:-6));
    addRep('vanguard',6+kept*2); addRep('civilian',kept*3); addUnity(kept>=3?4:0);
    say('ARAS',kept>=4?'Four out of four. You fly like somebody who has lost people before.'
                      :'We brought some of them home. I will take some.',5);}});

M({chapter:3, id:'ch3_m2', title:'RUN WITH MERCER', next:'ch3_m3',
  brief:'Kai Mercer has found a route nobody has flown. He wants a witness who can keep up.',
  weather:'overcast',
  intro:function(){
    say('MERCER','Mercer. I found a line through the ridge nobody has flown clean.',4.4);
    say('MERCER','Beat me or do not, but do not fly it like a checklist.',4);
  },
  objectives:[
    {text:function(){return 'FLY MERCER’S LINE ('+(gates.length-gatesLeft())+'/'+gates.length+')';},
     setup:function(){
       var pts=[[-1500,540,1100],[-800,480,900],[-100,440,700],[600,470,300],
                [900,520,-300],[300,560,-900],[-600,600,-1100],[-1500,660,-500]];
       for(var i=0;i<pts.length;i++)makeGate(pts[i][0],pts[i][1],pts[i][2],58);
       spawnFlier({at:new THREE.Vector3(-1550,580,1080),hp:420,speed:124,name:'MERCER',
         tint:0x6fe3d0,
         path:[new THREE.Vector3(-800,480,900),new THREE.Vector3(-100,440,700),
               new THREE.Vector3(600,470,300),new THREE.Vector3(900,520,-300),
               new THREE.Vector3(300,560,-900),new THREE.Vector3(-1500,660,-500)]});
     },
     step:function(){
       if(mission.t>26&&!mission.obj._nag){mission.obj._nag=true;
         say('MERCER','You are flying it safe. Safe is slow.',3.6);}
     },
     done:function(){return gatesLeft()===0;}}
  ],
  reward:function(){
    var t=Math.round(mission.t);
    SAVE.trials.mercer=t;
    addTrust('mercer',t<95?20:8);
    addRep('tempest',12); addUnity(2);
    say('MERCER',t<95?'That was flying. Come and find me when this all goes wrong.'
                     :'You finished it. Most people do not finish it.',4.8);}});

M({chapter:3, id:'ch3_m3', title:'BURN WITH SERRANO', next:'ch3_m4',
  brief:'Niko Serrano wants a straight fight, and then wants you to see what Inferno is protecting.',
  intro:function(){
    say('SERRANO','Serrano. One pass, no wingmen, no cease signal.',4);
  },
  objectives:[
    {text:'DUEL NIKO "CINDER" SERRANO',
     setup:function(){
       spawnFlier({at:new THREE.Vector3(1500,820,0),hostile:true,hp:300,speed:118,name:'SERRANO'});
     },
     done:function(){return hostilesLeft()===0;}},
    {text:function(){return 'DEFEND THE FOUNDRY LINE ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       say('SERRANO','Good. Now the part I actually called you for.',3.8);
       say('SERRANO','That foundry feeds four settlements. Black Wing has been circling it for a week.',5);
       makeSite({at:new THREE.Vector3(2000,0,700),kind:'slab',height:110,radius:36,
         hold:5,holdR:400,name:'FOUNDRY'});
       for(var i=0;i<5;i++)
         spawnFlier({at:new THREE.Vector3(rnd(1600,2400),rnd(650,950),rnd(200,1400)),
           hostile:true,hp:60,speed:110,name:'RAIDER'});
     },
     done:function(){return hostilesLeft()===0;}},
    {text:function(){return 'HOLD OVER THE FOUNDRY ('+sitesWorked()+'/'+sitesToWork()+')';},
     done:function(){return allWorked();}}
  ],
  reward:function(){
    /* Aras scales to 22 and Mercer to 20; a flat 18 meant Serrano alone could
       never reach the 20 an allied ace needs, so his own trial could not do
       what the other two trials do. He is scored on the same thing he asked
       you to protect. */
    var held=allWorked(), hp=Math.round(player.hp);
    SAVE.trials.serrano=hp;
    addTrust('serrano',held?(hp>60?24:18):8);
    addRep('inferno',14); addRep('civilian',held?10:0); addUnity(held?4:1);
    say('SERRANO',hp>60?'You did not give a metre of that line. Noted.'
                       :'You held it. Expensively, but you held it.',4.4);
    say('SERRANO','Everyone thinks Inferno is the fist. Nobody asks what the fist is around.',5.4);}});

M({chapter:3, id:'ch3_m4', title:'ACE HUNT', next:'ch4_m1', last:true,
  brief:'Black Wing is removing ace pilots. Two are down at once. You can only reach one first.',
  weather:'storm',
  intro:function(){
    say('MARA','Two distress beacons. Both aces. Both being worked over right now.',4.6);
    say('MARA','Whoever you reach second is going to be on their own for a while.',4.4);
  },
  objectives:[
    {text:'CHOOSE WHO YOU REACH FIRST',
     setup:function(){
       openChoice('TWO BEACONS',
         'Both will survive the night if you are quick. Only one of them will '+
         'remember that you came for them first.',
         [{k:'aras',label:'REACH ARAS'},{k:'mercer',label:'REACH MERCER'},
          {k:'serrano',label:'REACH SERRANO'}]);
     },
     done:function(){return !!mission.choice;}},
    {text:function(){return 'BREAK THE AMBUSH ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       var who=(mission.choice||'aras').toUpperCase();
       say(who,'You came. Get them off me and I will do the rest.',4);
       spawnFlier({at:new THREE.Vector3(-400,760,900),big:true,hp:200,speed:88,name:who,
         path:[BREAKWATER.clone()]});
       for(var i=0;i<6;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-1000,600),rnd(700,1050),rnd(400,1500)),
           hostile:true,hp:62,speed:112,name:'HUNTER'});
     },
     fail:function(){return convoyAlive()===0;},
     failText:'You did not get there in time. Nobody is going to say it out loud.',
     done:function(){return hostilesLeft()<=1;}},
    {text:'SEE THEM HOME',
     setup:function(){say('MARA','Walk them back. The other beacon went quiet on its own.',4.2);},
     fail:function(){return convoyAlive()===0;},
     failText:'You lost them on the way home. That is the worst way to lose someone.',
     done:function(){return convoyArrived();}}
  ],
  chapterEnd:'Black Wing has stopped pretending this is about the Arena. '+
    'Faction bases are being hit next, with each other’s signatures.',
  reward:function(){
    var k=mission.choice||'aras';
    addTrust(k,24);
    /* the two you did not reach do not hate you for it, but they noticed */
    TRUST_KEYS.forEach(function(t){ if(t!==k&&t!=='nyx')addTrust(t,-4); });
    addRep('independent',10); addUnity(4); SAVE.credits+=1200;
    SAVE.flags.rescuedAce=k;
    say('MARA','They are picking off the people who could organise a defence. '+
      'That is not a raid. That is a campaign.',6);}});

