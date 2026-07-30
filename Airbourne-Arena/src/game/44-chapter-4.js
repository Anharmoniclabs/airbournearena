/* ===================== CHAPTER 4 — BROKEN ALLIANCE =====================
   Section 10. The rivalry becomes a political crisis, and the reveal lands:
   the Warden Network needs all three teams' technology, which is why all
   three have been robbed.                                                 */

M({chapter:4, id:'ch4_m1', title:'FALSE FLAG', next:'ch4_m2',
  brief:'A faction base is under attack by aircraft wearing somebody else’s colours.',
  intro:function(){
    say('MARA','Base under attack, and the attackers are squawking Tempest identifiers.',4.6);
    say('KADE','Tempest has nothing in that airspace. Nothing. Somebody is wearing our name.',5);
    say('VALE','Vanguard has three squadrons asking me for permission to answer that. '+
      'I am holding them. For now.',5.4);
  },
  objectives:[
    {text:function(){return 'BREAK THE ATTACK ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       for(var i=0;i<6;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-2400,-1400),rnd(650,1000),rnd(-900,900)),
           hostile:true,hp:62,speed:112,name:'FALSE FLAG'});
     },
     done:function(){return hostilesLeft()===0;}},
    {text:function(){return 'READ THE DOWNED HULLS ('+sitesWorked()+'/'+sitesToWork()+')';},
     setup:function(){
       say('MARA','Hold over each wreck. I want the identifiers on record before anyone tidies up.',4.8);
       makeSite({at:new THREE.Vector3(-1900,0,-500),kind:'slab',height:24,radius:20,
         hold:5,holdR:300,name:'HULL A'});
       makeSite({at:new THREE.Vector3(-1500,0,600),kind:'slab',height:24,radius:20,
         hold:5,holdR:300,name:'HULL B'});
     },
     done:function(){return allWorked();}}
  ],
  reward:function(){
    addRep('tempest',14); addRep('vanguard',8); addRep('independent',8);
    addUnity(5); SAVE.credits+=900;
    SAVE.flags.falseFlagProof=true;
    say('VALE','Vanguard has the same recording. We are still deciding whether to believe it.',5);}});

M({chapter:4, id:'ch4_m2', title:'THE SHIPMENT', next:'ch4_m3',
  brief:'Follow a covert transport to whatever it is feeding. Do not shoot it down.',
  weather:'overcast',
  intro:function(){
    say('MARA','Do not kill it. A wreck tells you what it was carrying. A landing tells you who wanted it.',5.2);
  },
  objectives:[
    {text:'STAY WITH THE SHIPMENT',
     setup:function(){
       spawnFlier({at:new THREE.Vector3(-2100,700,-800),big:true,hp:400,speed:80,name:'SHIPMENT',
         path:[new THREE.Vector3(-600,760,-1400),new THREE.Vector3(900,800,-1200),
               new THREE.Vector3(2000,720,-600)]});
     },
     step:function(dt){
       var sh=namedFlier('SHIPMENT');
       if(sh&&sh.alive&&player.alive&&player.pos.distanceTo(sh.pos)>1500)
         banner('SHIPMENT DRIFTING OUT OF RANGE',.9);
     },
     fail:function(){
       var sh=namedFlier('SHIPMENT');
       return !!sh&&!sh.alive;
     },
     failText:'You shot it down. Whatever it was going to, it is not going there now.',
     done:function(){return convoyArrived();}},
    {text:function(){return 'TAKE THE RELAY SITE ('+sitesLeft()+' STANDING)';},
     setup:function(){
       say('MARA','There. A relay nobody filed and nobody is admitting to.',4.4);
       makeSite({at:new THREE.Vector3(2100,0,-700),kind:'mast',height:150,radius:34,
         hp:340,guns:true,name:'RELAY MAST'});
       makeSite({at:new THREE.Vector3(2350,0,-350),kind:'slab',height:80,radius:28,
         hp:240,guns:true,name:'RELAY GUN'});
       for(var i=0;i<3;i++)
         spawnFlier({at:new THREE.Vector3(rnd(1900,2500),rnd(700,950),rnd(-1100,-200)),
           hostile:true,hp:62,speed:110,name:'GUARD'});
     },
     done:function(){return sitesLeft()===0;}}
  ],
  reward:function(){
    addRep('independent',12); addUnity(4); SAVE.credits+=1000;
    SAVE.flags.foundRelay=true;
    say('MARA','Vanguard command architecture. Tempest governors. Inferno power. '+
      'All three, in one relay, wired together.',6);
    say('KADE','Those governors left our foundry in a sealed crate. Somebody signed for them.',5.2);}});

M({chapter:4, id:'ch4_m3', title:'WITNESS', next:'ch4_m4',
  brief:'A Black Wing engineer wants out and will testify. Everyone would rather she did not arrive.',
  weather:'rain',
  intro:function(){
    say('MARA','She built part of it. She will say so on an open channel if she lives to reach us.',5);
    say('VEYR','You are carrying a defector through my airspace. Consider what that says about your judgement.',5.4);
  },
  objectives:[
    {text:function(){return 'GET THE WITNESS THROUGH ('+convoyAlive()+' ALIVE)';},
     setup:function(){
       spawnFlier({at:new THREE.Vector3(2200,700,900),big:true,hp:180,speed:82,name:'WITNESS',
         path:[new THREE.Vector3(600,720,500),new THREE.Vector3(-900,680,200),
               BREAKWATER.clone()]});
       for(var i=0;i<4;i++)
         spawnFlier({at:new THREE.Vector3(rnd(600,2000),rnd(700,1000),rnd(-600,1200)),
           hostile:true,hp:60,speed:114,name:'INTERCEPT'});
     },
     fail:function(){return convoyAlive()===0;},
     failText:'The witness is dead and the recording died with her.',
     step:function(dt){
       if(mission.t>30&&!mission.obj._wave){mission.obj._wave=true;
         say('VEYR','Last chance to be somewhere else.',3.4);
         for(var i=0;i<3;i++)
           spawnFlier({at:new THREE.Vector3(rnd(-1400,200),rnd(750,1050),rnd(-900,900)),
             hostile:true,hp:60,speed:114,name:'INTERCEPT'});
       }
     },
     done:function(){return convoyArrived();}}
  ],
  reward:function(){
    addRep('civilian',14); addRep('independent',14); addUnity(6); SAVE.credits+=1300;
    addRep('vanguard',6); addRep('tempest',6); addRep('inferno',6);
    SAVE.flags.witness=true;
    say('MARA','She named the schism. Cassian did not leave Vanguard. He was asked to.',5.4);}});

M({chapter:4, id:'ch4_m4', title:'THE LEDGER', next:'ch5_m1', last:true,
  brief:'The evidence implicates your own team as well. Cassian would very much like you to sit on it.',
  intro:function(){
    say('VEYR','Cassian Veyr. You have been thorough. I would like to make you an offer.',5);
    say('VEYR','Publish all of it and your own team burns with the rest. Publish half and you stay a hero.',5.6);
  },
  objectives:[
    {text:function(){return 'SURVIVE VEYR’S ESCORT ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       say('VEYR','I will let you think about it. My flight will keep you company.',4.2);
       for(var i=0;i<5;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-900,900),rnd(800,1150),rnd(-1200,1200)),
           hostile:true,hp:66,speed:116,name:'NOCTURNE'});
     },
     done:function(){return hostilesLeft()<=1;}},
    {text:'DECIDE WHAT TO PUBLISH',
     setup:function(){
       openChoice('THE LEDGER',
         'The full record proves Black Wing manufactured this war. It also '+
         'proves your own team looked away while it happened.',
         [{k:'all',label:'PUBLISH ALL OF IT',
           apply:function(){
             addUnity(18); addRep('civilian',16); addRep('independent',12);
             addRep(factionKey(),-14);
             SAVE.flags.ledger='all';
             say('MARA','Your own team will not speak to you for a month. The other two just started listening.',5.4);}},
          {k:'half',label:'PROTECT YOUR TEAM',
           apply:function(){
             addUnity(-12); addRep(factionKey(),18);
             addRep('civilian',-6);
             SAVE.flags.ledger='half';
             say('MARA','Your team is safe. So is the part of this that made it possible.',5);}},
          {k:'veyr',label:'HAND IT TO CASSIAN',
           apply:function(){
             addUnity(-24); addRep('blackwing',24); addRep('civilian',-14);
             SAVE.flags.ledger='veyr';
             say('VEYR','A pragmatist. I did not expect that. I am not sure I am pleased.',5.4);}}]);
     },
     done:function(){return !!mission.choice;}}
  ],
  chapterEnd:'It is proven, and it is too late — the shooting has already '+
    'started in three regions at once.',
  reward:function(){
    addRep('independent',8); SAVE.credits+=1500;
    /* the evidence you actually gathered is what the ledger is made of */
    var chain=(SAVE.flags.sawStolenTech?1:0)+(SAVE.flags.falseFlagProof?1:0)+
              (SAVE.flags.foundRelay?1:0)+(SAVE.flags.witness?1:0);
    SAVE.flags.evidence=chain;
    if(chain>=4){
      addUnity(6); addRep('civilian',6);
      say('VALE','Four independent sources. That is not an accusation any more, '+
        'it is a finding.',5.4);
    } else {
      say('VALE','It is thin in places. Enough people want to believe it that '+
        'it will travel anyway. That is not the same thing.',5.6);
    }
    say('CALDER','Inferno will stand down its forward flights for seventy-two hours. '+
      'That is what I can give you.',5.4);
    say('MARA','Everyone knows now. Everyone is also already shooting. '+
      'Knowing was never going to be enough on its own.',6);}});

