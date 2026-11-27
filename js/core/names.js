// Invented player names (owner's choice, Session 7: a realistic mix with lots of variety: mostly American, many Latin
// American, some Asian and others). Logic file: no DOM. M2 step 2.1a task 2 (Session 27); every list, weight and rule
// below is Claude's default.
//
//   B3.names.pick(rng, used)    { first, last, group, country }: a full name from two lists, never a real MLB player's
//                               (B3.realNames, below) and never one already in `used` (an object of keys; pick adds
//                               the new key). rng is a B3.rng generator.
//   B3.names.key(first, last)   the name's key: both parts lowercased, accents and anything but letters dropped
//   B3.names.isReal(first, last) true when the name is a real MLB player's (by B3.realNames' hashes)
//   B3.names.hash(text)         the 32-bit FNV-1a hash of a key, in base 36 (how B3.realNames stores names)
//   B3.names.GROUPS, FIRST, LAST the lists
//
// The rule (DESIGN.md section 6): no real MLB player's name is ever used. Common first and last names are real names
// by themselves; a pair of them can be a real player's (two common Latin names often are). B3.realNames
// (js/core/realnames.js, built by tools/realnames.js from the Chadwick Bureau register) holds a hash of every MLB
// player's name, from 1871 on, whose first and last name are both in these lists, so no real names are written in the
// code; pick() draws again on a match.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  // Name groups: their share of players, where they are born, and their lists. 'us' covers the United States, Canada and
  // Australia; U.S.-born players with roots elsewhere are mixed in (the owner's note, Session 27: Spanish and Asian names
  // integrated too): about one 'us' player in eight has a Latin American last name (a third of those a Latin American
  // first name too), and about one in thirty an Asian last name (Japanese, Korean or Taiwanese) with an American first
  // name. MLB's mix is about 72% U.S.-born, 26% Latin American, 1.5% Asian; this mix gives Asia and the others a little more
  // for variety (the owner's "lots of variety").
  const GROUPS = {
    us: { share: 63, born: [['USA', 95], ['CAN', 3.5], ['AUS', 1.5]], latinLast: 0.12, latinFirst: 0.33, asianLast: 0.035 },
    latin: { share: 27, born: [['DOM', 40], ['VEN', 27], ['CUB', 10], ['PRI', 9], ['MEX', 8], ['COL', 3], ['PAN', 2], ['NIC', 1]] },
    jp: { share: 2.2, born: [['JPN', 1]] },
    kr: { share: 1.4, born: [['KOR', 1]] },
    tw: { share: 1.2, born: [['TWN', 1]] },
    nl: { share: 1.8, born: [['CUW', 60], ['ABW', 15], ['NLD', 25]] },
    it: { share: 1.0, born: [['ITA', 1]] },
    de: { share: 1.0, born: [['DEU', 1]] },
    br: { share: 1.4, born: [['BRA', 1]] }
  };

  const s = (text) => text.trim().split(/\s*,\s*/);
  const FIRST = {
    us: s(`Aaron, Adam, Aiden, Alex, Andre, Andrew, Anthony, Austin, Avery, Beau, Ben, Benjamin, Blaine, Blake, Bo, Bobby,
      Brad, Brady, Brandon, Brendan, Brent, Brett, Brian, Brock, Brody, Brooks, Bryce, Bryson, Cade, Cal, Caleb, Calvin,
      Cameron, Carl, Carson, Carter, Casey, Chad, Chance, Chase, Chris, Christian, Clark, Clay, Clayton, Cody, Colby, Cole,
      Colin, Colt, Colton, Connor, Cooper, Corbin, Corey, Craig, Curtis, Dakota, Dale, Dalton, Damon, Dane, Daniel, Danny,
      Darius, Darnell, Darren, David, Davis, Dawson, Dean, Denny, Derek, Derrick, Devin, DeShawn, Dominic, Donovan, Drew,
      Duncan, Dustin, Dylan, Easton, Eddie, Eli, Elijah, Emmett, Eric, Ethan, Evan, Finn, Gabe, Garrett, Gavin, Glenn, Grady,
      Graham, Grant, Greg, Griffin, Gus, Hank, Harrison, Hayden, Heath, Henry, Hudson, Hunter, Ian, Isaac, Isaiah, Jace,
      Jack, Jackson, Jacob, Jake, Jalen, Jamal, Jamie, James, Jared, Jarrett, Jason, Jay, Jaylen, Jeff, Jeremiah, Jeremy,
      Jesse, Jim, Joe, Joey, John, Jonah, Jonathan, Jordan, Josh, Joshua, Judson, Justin, Kade, Keaton, Keegan, Keith,
      Kellan, Ken, Kendall, Kevin, Kirk, Kyle, Lance, Landon, Lane, Lawson, Lee, Leo, Levi, Logan, Lucas, Luke, Malik,
      Marcus, Mark, Marshall, Mason, Matt, Matthew, Max, Micah, Michael, Mike, Miles, Mitch, Mitchell, Nash, Nate, Nathan,
      Neil, Nick, Nolan, Noah, Oliver, Owen, Parker, Pat, Patrick, Paul, Peter, Pierce, Preston, Quentin, Quinn, Reece,
      Reggie, Reid, Rhett, Riley, Rob, Rodney, Roman, Ross, Russ, Ryan, Ryder, Sam, Samuel, Sawyer, Scott, Sean, Seth, Shane,
      Shawn, Silas, Spencer, Stephen, Steve, Steven, Tanner, Tate, Terrance, Terrell, Thomas, Tim, Toby, Todd, Tom, Tony,
      Travis, Trent, Trevor, Trey, Tristan, Troy, Tucker, Ty, Tyler, Tyson, Vance, Wade, Walker, Warren, Wes, Wesley,
      Weston, Will, Wyatt, Xavier, Zach, Zane`),
    latin: s(`Abel, Adolfo, Adonis, Adrian, Agustin, Alberto, Aldo, Alejandro, Alexis, Alfredo, Alonso, Amaury, Anderson,
      Andres, Angel, Antonio, Ariel, Armando, Arturo, Benito, Braulio, Camilo, Carlos, Cesar, Christopher, Claudio,
      Cristian, Cristobal, Damian, Dario, Darwin, Deivi, Diego, Domingo, Edgar, Eduardo, Edwin, Efrain, Elian, Elvin, Elvis,
      Emilio, Emmanuel, Enrique, Erasmo, Erick, Ernesto, Esteban, Eury, Ezequiel, Fabian, Felix, Fernando, Francisco,
      Franklin, Freddy, Gabriel, Genaro, Geraldo, Gerardo, Gilberto, Gregorio, Guillermo, Gustavo, Hector, Heriberto,
      Hernan, Hugo, Ignacio, Ismael, Jairo, Javier, Jeison, Jesus, Jhoan, Jhonny, Joaquin, Joel, Johan, Jorge, Jose, Josue,
      Juan, Julian, Julio, Junior, Leandro, Leonardo, Leonel, Lisandro, Lorenzo, Luis, Manuel, Marcelo, Marco, Marcos,
      Mario, Martin, Mauricio, Maximo, Miguel, Moises, Nelson, Nestor, Nicolas, Noel, Octavio, Omar, Orlando, Oscar,
      Osvaldo, Pablo, Pedro, Rafael, Ramiro, Ramon, Raul, Reinaldo, Reynaldo, Ricardo, Rigoberto, Roberto, Rodolfo,
      Rodrigo, Rolando, Ronny, Ruben, Salvador, Santiago, Saul, Sebastian, Sergio, Simon, Starlin, Teodoro, Tomas, Ubaldo,
      Ulises, Valentin, Vicente, Victor, Wander, Wilfredo, Wilkin, Willy, Wilmer, Wilson, Yandel, Yeferson, Yeison, Yoel,
      Yohan, Yonny, Yunior`),
    jp: s(`Akira, Atsushi, Daichi, Daiki, Daisuke, Fumiya, Haruki, Haruto, Hayato, Hideki, Hiroki, Hiroshi, Itsuki, Jun,
      Kaito, Kazuki, Keisuke, Kenji, Kenta, Kohei, Koji, Kosuke, Makoto, Masahiro, Masato, Minato, Naoki, Ren, Riku, Ryo,
      Ryosuke, Ryota, Satoshi, Shinji, Sho, Shogo, Shota, Shun, Sota, Taichi, Taisei, Takeshi, Takumi, Takuya, Tatsuya,
      Tetsuya, Tomoya, Yamato, Yoshiki, Yuki, Yuma, Yusuke, Yuto, Yuya`),
    kr: s(`Byung-ho, Dae-sung, Do-yun, Dong-hyun, Eun-chan, Gun-woo, Han-gyeol, Ho-jun, Hyun-woo, In-sung, Jae-hyuk, Jae-won,
      Ji-hoon, Ji-hwan, Jin-woo, Joon-young, Jun-ho, Kang-min, Kyung-soo, Min-ho, Min-jun, Min-seok, Sang-woo, Seo-jun,
      Seung-woo, Si-woo, Sung-hyun, Sung-min, Tae-hoon, Tae-yang, Won-jae, Woo-jin, Ye-jun, Yong-jun, Yoon-ho, Young-ho`),
    tw: s(`Bo-wei, Chen-wei, Cheng-en, Cheng-yu, Chia-hao, Chieh-yu, Chih-hao, Chih-wei, Chun-hao, Chun-wei, Guan-ting,
      Hao-yu, Hsiang-yu, Hung-wen, Jia-hao, Jui-lin, Kai-wen, Kuan-yu, Ming-jie, Pei-chen, Ping-hsun, Po-hsuan, Sheng-hao,
      Shih-chieh, Ting-wei, Tsung-han, Tzu-wei, Wei-lun, Yen-ting, Yi-chen, Yu-cheng, Yu-hsiang, Yu-ting, Zhi-hao`),
    nl: s(`Bram, Daan, Jair, Jordy, Joost, Lars, Niels, Roel, Ruben, Shairon, Sem, Stijn, Sven, Thijs, Wesley`),
    it: s(`Alessandro, Andrea, Davide, Federico, Giovanni, Lorenzo, Luca, Marco, Matteo, Nicola, Paolo, Riccardo, Stefano`),
    de: s(`Elias, Felix, Florian, Jan, Jonas, Kai, Lukas, Max, Moritz, Niklas, Paul, Tobias`),
    br: s(`Bruno, Caio, Felipe, Gabriel, Gustavo, Lucas, Mateus, Rafael, Thiago, Vinicius`)
  };
  const LAST = {
    us: s(`Abbott, Ackerman, Adams, Aldridge, Alford, Allen, Ames, Anderson, Archer, Armstrong, Arnold, Ashby, Atkins,
      Austin, Avery, Bailey, Baker, Baldwin, Banks, Barker, Barnes, Barrett, Bartlett, Barton, Bates, Baxter, Beard, Beck,
      Bell, Bennett, Benson, Bentley, Berry, Bird, Bishop, Black, Blackburn, Blair, Blake, Bolton, Booker, Booth, Boone,
      Bowen, Bowers, Bowman, Boyd, Bradford, Bradley, Bradshaw, Brady, Brennan, Brewer, Briggs, Brock, Brooks, Brown,
      Bryan, Bryant, Buchanan, Buckley, Burgess, Burke, Burns, Burton, Bush, Butler, Byrd, Cahill, Cain, Caldwell, Calhoun,
      Callahan, Campbell, Cannon, Cantrell, Carey, Carlson, Carmichael, Carpenter, Carr, Carroll, Carter, Carver, Casey,
      Cash, Chambers, Chandler, Chapman, Childers, Christensen, Church, Clark, Clarke, Clayton, Cline, Cobb, Cochran, Coffey,
      Cole, Coleman, Collins, Combs, Compton, Conley, Connolly, Conway, Cook, Cooper, Copeland, Corbett, Cowan, Cox, Craig,
      Crane, Crawford, Crosby, Cross, Crowley, Culver, Cunningham, Curtis, Dahl, Dalton, Daly, Daniels, Darby, Davenport,
      Davidson, Davis, Dawson, Day, Dean, Decker, Delaney, Dempsey, Dennis, Dillon, Dixon, Dodd, Donahue, Donovan, Dorsey,
      Dougherty, Douglas, Dowd, Doyle, Drake, Driscoll, Dudley, Duffy, Dugan, Duncan, Dunn, Durham, Dwyer, Eaton, Eckert,
      Edwards, Elliott, Ellis, Ellison, Emerson, England, Ennis, Erickson, Evans, Everett, Ewing, Farley, Farmer, Farrell,
      Faulkner, Fenton, Ferguson, Fields, Finch, Finley, Fisher, Fitch, Fitzgerald, Flanagan, Fleming, Fletcher, Flynn,
      Forbes, Ford, Foster, Fowler, Fox, Francis, Fraser, Frazier, Freeman, Fritz, Frost, Fuller, Fulton, Gaines,
      Gallagher, Galloway, Gardner, Garner, Garrison, Gates, Gentry, Gibson, Gilbert, Gill, Gillespie, Glover, Goff, Golden,
      Goodwin, Gordon, Gould, Grady, Graham, Granger, Grant, Graves, Gray, Green, Greer, Gregory, Griffin, Griffith, Griggs,
      Grimes, Guthrie, Hagen, Hale, Haley, Hall, Halloran, Hamilton, Hammond, Hancock, Hansen, Hanson, Hardin, Hardy,
      Harmon, Harper, Harrell, Harrington, Harris, Hart, Hartman, Hatcher, Hawkins, Hayden, Hayes, Healy, Heath, Henderson,
      Hendricks, Hendrix, Henry, Hensley, Herring, Hess, Hewitt, Hicks, Higgins, Hill, Hinton, Hobbs, Hodges, Hoffman,
      Hogan, Holland, Holloway, Holmes, Holt, Hood, Hooper, Hopkins, Horne, Horton, Houston, Howard, Howell, Hubbard, Huber,
      Hudson, Huff, Hughes, Hull, Humphrey, Hunt, Hunter, Hurley, Hyde, Ingram, Irwin, Jacobs, James, Jarvis, Jeffries,
      Jenkins, Jennings, Jensen, Johnson, Jones, Jordan, Kane, Kaufman, Keane, Keating, Keefe, Keller, Kelley, Kelly, Kemp,
      Kendall, Kennedy, Kerr, Kessler, Kilgore, Kimball, Kincaid, King, Kinney, Kirby, Kirk, Klein, Kline, Knapp, Knight,
      Knox, Kramer, Kruger, Lacey, Lamb, Lambert, Landry, Lane, Lang, Larkin, Larsen, Lawler, Lawrence, Lawson, Leach, Lee,
      Lennon, Lewis, Lindgren, Lindsey, Little, Lockhart, Logan, Long, Lowe, Lowry, Lucas, Lynch, Lyons, Mack, Macklin,
      Maddox, Mahoney, Malloy, Malone, Mann, Manning, Marsh, Marshall, Martin, Mason, Massey, Mathis, Matthews, Maxwell,
      Maynard, McAllister, McBride, McCann, McCarthy, McCormick, McCoy, McCullough, McDaniel, McDonald, McGee, McGrath,
      McGuire, McIntyre, McKay, McKenzie, McLean, McMahon, McNeil, Meadows, Mercer, Merritt, Meyer, Middleton, Miller,
      Mills, Mitchell, Monroe, Montgomery, Moody, Moore, Moran, Morgan, Morris, Morrison, Morrow, Morton, Moss, Mullins,
      Munson, Murphy, Murray, Myers, Nance, Nash, Neal, Nelson, Newman, Newton, Nichols, Noble, Nolan, Norris, Norton,
      Novak, Nugent, O'Brien, O'Connor, O'Neill, Oakes, Odom, Oliver, Olsen, Olson, Osborne, Owens, Pace, Page, Palmer,
      Parker, Parrish, Parsons, Patterson, Patton, Payne, Pearson, Peck, Pennington, Perkins, Perry, Peters, Peterson,
      Phillips, Pickett, Pierce, Pike, Pollard, Pope, Porter, Potter, Powell, Pratt, Prescott, Preston, Price, Pruitt,
      Pugh, Quigley, Quinn, Ramsey, Randall, Rankin, Ratliff, Rawlings, Ray, Reagan, Reed, Reese, Reilly, Reynolds, Rhodes,
      Rice, Rich, Richards, Richardson, Riggs, Riley, Ritter, Roach, Robbins, Roberts, Robinson, Rogers, Rollins, Ross,
      Rowe, Rucker, Rush, Russell, Rutledge, Ryan, Salisbury, Sampson, Sanders, Saunders, Sawyer, Schaefer, Schroeder,
      Schultz, Scott, Sears, Sexton, Shannon, Sharp, Shaw, Shea, Sheehan, Shelton, Sherman, Shields, Short, Simmons,
      Simpson, Sinclair, Skinner, Slater, Sloan, Small, Smith, Snyder, Sparks, Spencer, Stafford, Stanley, Stark, Steele,
      Stephens, Stevens, Stewart, Stokes, Stone, Strickland, Stroud, Sullivan, Summers, Sutton, Swain, Swanson, Sweeney,
      Talbot, Tanner, Tate, Taylor, Thomas, Thompson, Thornton, Tierney, Tobin, Todd, Townsend, Trask, Travers, Truitt,
      Tucker, Turner, Tyler, Underwood, Vance, Vaughn, Vickers, Voss, Wallace, Waller, Walsh, Walters, Walton, Ward, Ware,
      Warren, Washington, Waters, Watkins, Watson, Weaver, Webb, Welch, Wells, West, Whalen, Wheeler, Whitaker, White,
      Whitfield, Whitney, Wiggins, Wilcox, Wilder, Wilkins, Williams, Willis, Wilson, Winters, Wise, Witt, Wolfe, Womack,
      Wood, Woods, Wright, Wyatt, Yates, York, Young, Zimmerman`),
    latin: s(`Abreu, Acevedo, Acosta, Adames, Aguilar, Alcantara, Alfaro, Almanzar, Almonte, Altamirano, Alvarado, Alvarez,
      Amador, Amaya, Andujar, Aponte, Aquino, Aranda, Arias, Arredondo, Arroyo, Arteaga, Avila, Ayala, Baez, Barajas,
      Barrera, Barrios, Batista, Bautista, Becerra, Beltran, Benitez, Bermudez, Betancourt, Blanco, Bonilla, Bracho, Brito,
      Bustamante, Cabral, Cabrera, Calderon, Calixto, Camacho, Campos, Canales, Cardenas, Carmona, Carrasco, Carrillo, Casas,
      Castellanos, Castillo, Castro, Ceballos, Cedeno, Cepeda, Cervantes, Chavez, Cisneros, Collado, Colon, Concepcion,
      Contreras, Cordero, Cordova, Corona, Correa, Cortes, Crespo, Cruz, Cuevas, Davila, De Jesus, De la Cruz, De Leon,
      Del Rosario, Delgado, Diaz, Dominguez, Duran, Echeverria, Elias, Encarnacion, Escalante, Escobar, Espinal, Espinoza,
      Esquivel, Estrada, Fajardo, Feliciano, Feliz, Fermin, Fernandez, Figueroa, Florentino, Flores, Franco, Frias, Fuentes,
      Galindo, Gallardo, Galvez, Gamboa, Garcia, Garza, Gil, Gimenez, Godoy, Gomez, Gonzalez, Granados, Guerra, Guerrero,
      Guillen, Gutierrez, Guzman, Henriquez, Heredia, Hernandez, Herrera, Hidalgo, Hinojosa, Ibarra, Iglesias, Infante,
      Jaime, Jaramillo, Jerez, Jimenez, Juarez, Lantigua, Lara, Lebron, Ledesma, Leon, Leyva, Linares, Liriano, Lopez,
      Lozano, Lugo, Luna, Machado, Macias, Madera, Maldonado, Manzanillo, Marin, Marquez, Marrero, Marte, Martinez, Mata,
      Mateo, Matos, Medina, Mejia, Melendez, Mena, Mendez, Mendoza, Mercedes, Mesa, Meza, Mieses, Miranda, Molina,
      Monsalve, Montas, Montero, Montes, Montilla, Mora, Morales, Moreno, Moya, Munoz, Navarro, Nieves, Noriega, Novoa,
      Nunez, Ocampo, Ochoa, Olivares, Olivo, Orozco, Ortega, Ortiz, Osorio, Otero, Ovalle, Pacheco, Padilla, Pagan,
      Palacios, Paredes, Parra, Pascual, Paulino, Pena, Peralta, Perez, Pichardo, Pimentel, Pineda, Polanco, Quezada,
      Quintana, Quiroz, Ramirez, Ramos, Rendon, Rengifo, Restrepo, Reyes, Rincon, Rios, Rivas, Rivera, Robles, Rodriguez,
      Rojas, Romero, Rondon, Rosa, Rosado, Rosario, Rubio, Ruiz, Salas, Salazar, Saldana, Salgado, Samboy, Sanabria,
      Sanchez, Sandoval, Santana, Santiago, Santos, Segura, Serrano, Severino, Sierra, Silva, Solano, Sosa, Soto, Suarez,
      Tapia, Tavarez, Taveras, Tavera, Tejada, Tejeda, Toribio, Torres, Tovar, Trinidad, Trujillo, Ulloa, Urena, Urias,
      Uribe, Valdespino, Valdez, Valencia, Valenzuela, Valera, Vallejo, Varela, Vargas, Vasquez, Vazquez, Vega,
      Velasquez, Velez, Ventura, Vera, Villalobos, Villanueva, Villar, Vizcaino, Zabala, Zambrano, Zamora, Zapata, Zavala,
      Zuniga`),
    jp: s(`Abe, Aoki, Arai, Asano, Chiba, Endo, Fujii, Fujimoto, Fujita, Fujiwara, Fukuda, Goto, Hara, Harada, Hasegawa,
      Hashimoto, Hattori, Hayashi, Higuchi, Hirano, Hirata, Honda, Hoshino, Ikeda, Imai, Inoue, Ishida, Ishii, Ishikawa,
      Ito, Iwasaki, Kaneko, Kato, Kawaguchi, Kawasaki, Kikuchi, Kimura, Kinoshita, Kitamura, Kobayashi, Kojima, Komatsu,
      Kondo, Kubo, Kudo, Maeda, Maruyama, Masuda, Matsuda, Matsui, Matsumoto, Miura, Miyamoto, Miyazaki, Mochizuki, Mori,
      Morita, Murakami, Nagai, Nakagawa, Nakajima, Nakamura, Nakano, Nishida, Nishimura, Noguchi, Nomura, Ogawa, Okada,
      Ono, Ota, Otsuka, Saito, Sakai, Sakamoto, Sakurai, Sano, Sasaki, Sato, Shimizu, Sugiyama, Suzuki, Takada, Takagi,
      Takahashi, Takeda, Tamura, Tanaka, Taniguchi, Uchida, Ueda, Wada, Watanabe, Yamada, Yamaguchi, Yamamoto, Yamazaki,
      Yano, Yokoyama, Yoshida, Yoshikawa`),
    kr: s(`Ahn, Bae, Baek, Byun, Chae, Cho, Choi, Do, Gil, Go, Gu, Ha, Han, Heo, Hong, Hwang, Jang, Jeon, Jin, Ju, Jung, Kang,
      Kim, Koo, Kwak, Kwon, Lee, Lim, Min, Moon, Nam, Noh, Oh, Park, Pyo, Ra, Ryu, Seo, Seong, Shin, Son, Song, Woo, Yang,
      Yeo, Yoo, Yoon`),
    tw: s(`Chang, Chao, Chen, Cheng, Chiang, Chien, Chou, Chu, Chung, Fang, Fu, Ho, Hou, Hsieh, Hsu, Hu, Huang, Hung, Jiang,
      Kao, Ko, Kuo, Lai, Liang, Liao, Lin, Liu, Lo, Lu, Pan, Peng, Shih, Su, Sun, Tang, Teng, Tsai, Tsao, Tseng, Wang, Wei,
      Wu, Yang, Yeh, Yu`),
    nl: s(`Bakker, Bos, Brouwer, Croes, Daal, de Boer, de Groot, de Vries, Dekker, Girigori, Hendriks, Isenia, Kok, Martina,
      Meijer, Mulder, Pieternella, Rosaria, Smit, Statia, van Dijk, Victorina, Visser, Vos`),
    it: s(`Barbieri, Bianchi, Bruno, Colombo, Conti, Costa, De Luca, Esposito, Ferrari, Gallo, Greco, Lombardi, Marino, Moretti,
      Ricci, Rinaldi, Romano, Rossi, Russo, Villa`),
    de: s(`Bauer, Becker, Fischer, Hartmann, Hoffmann, Koch, Krause, Lange, Meyer, Richter, Schmitt, Schneider, Schulz, Wagner,
      Weber, Wolf`),
    br: s(`Almeida, Araujo, Barbosa, Carvalho, Costa, Ferreira, Gomes, Lima, Oliveira, Pereira, Ribeiro, Rocha, Santos, Silva,
      Souza`)
  };

  function norm(text) {
    return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  }
  function key(first, last) { return norm(first) + ' ' + norm(last); }

  // 32-bit FNV-1a, in base 36.
  function hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }

  let realSet = null, realFrom = null;
  function real() {
    const src = B3.realNames ? B3.realNames.hashes : '';
    if (realFrom !== src) { realSet = new Set(src ? src.split(',') : []); realFrom = src; }
    return realSet;
  }
  function isReal(first, last) { return real().has(hash(key(first, last))); }

  const ASIAN = ['jp', 'kr', 'tw'];
  function weighted(rng, pairs) { return pairs[rng.weighted(pairs.map((p) => p[1]))][0]; }
  const GROUP_LIST = Object.keys(GROUPS).map((g) => [g, GROUPS[g].share]);

  // One full name. Draws again when the name is a real MLB player's or in `used`; every 40 tries it draws a new group too,
  // so a small group that is full doesn't stop it (after 400 tries it gives up loudly).
  function pick(rng, used) {
    let group, G, country;
    for (let tries = 0; tries < 400; tries++) {
      if (tries % 40 === 0) { group = weighted(rng, GROUP_LIST); G = GROUPS[group]; country = weighted(rng, G.born); }
      let fl = FIRST[group], ll = LAST[group];
      const mix = rng.next();
      if (G.latinLast && mix < G.latinLast) { ll = LAST.latin; if (rng.next() < G.latinFirst) fl = FIRST.latin; }
      else if (G.asianLast && mix < G.latinLast + G.asianLast) ll = LAST[ASIAN[Math.floor(rng.next() * ASIAN.length)]];
      const first = fl[Math.floor(rng.next() * fl.length)], last = ll[Math.floor(rng.next() * ll.length)];
      const k = key(first, last);
      if (isReal(first, last) || (used && Object.prototype.hasOwnProperty.call(used, k))) continue;
      if (used) used[k] = 1;
      return { first: first, last: last, group: group, country: country };
    }
    throw new Error('B3.names: no free name after 400 tries');
  }

  B3.names = { GROUPS: GROUPS, FIRST: FIRST, LAST: LAST, pick: pick, key: key, norm: norm, hash: hash, isReal: isReal };
})(typeof globalThis !== 'undefined' ? globalThis : this);
