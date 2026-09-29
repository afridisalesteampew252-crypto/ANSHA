export type ExportMarketShippingGuide = {
  code: string;
  name: string;
  region: string;
  yearRestriction: string;
  destinationPort: string;
  transitTime: string;
  vesselSchedule: string;
  shippingLine: string;
  inspection: string;
  routeNote?: string;
};

/**
 * Customer-facing summary from the ANSHA-provided country tables.
 * Schedules, age restrictions, carriers, and inspection notes are indicative
 * and must be checked with customs and the carrier before a booking is confirmed.
 *
 * Fields: code~name~region~year~ports or inland destination~transit time~schedule~line~inspection~route note
 */
const SOURCE = String.raw\`
AO~Angola~Africa~Max. 5 years old~Luanda; Durban is a South African transit port~24–36 days (RoRo)~Monthly (RoRo)~Waitara~PSI~
BW~Botswana~Africa~No age limit~Durban (South Africa), transit port~24–34 days (RoRo)~Monthly (RoRo)~Mediterranean Shipping Company~No inspection required~Inland delivery from Durban; confirm transit and border costs.
BJ~Benin~Africa~No age limit~Cotonou~34–44 days (RoRo)~Monthly (RoRo)~Not supplied~Required~
BI~Burundi~Africa~No age limit~Dar es Salaam (Tanzania), transit port~24–34 days (RoRo)~Monthly (RoRo)~Keihin; MOL; Hoegh Autoliners~No inspection required~Inland delivery; confirm corridor and onward transit.
BF~Burkina Faso~Africa~No age limit~Ouagadougou and Koudougou (inland destinations; sea port to confirm)~28–36 days (container, estimate)~Weekly (container, estimate)~Fesco Lines~No inspection required~Landlocked; transit port and inland leg must be confirmed.
CI~Côte d’Ivoire~Africa~Max. 5 years old~Abidjan~34–46 days (RoRo, estimate)~Confirm with carrier~OMA Côte d’Ivoire~Confirm locally~Source row had conflicting transit/schedule values; verify before quoting.
KM~Comoros~Africa~Not supplied~Moroni~28–34 days (container)~Weekly (container)~Not supplied~Not supplied~
CD~DR Congo~Africa~No age limit~Dar es Salaam (Tanzania), transit port~24–34 days (RoRo)~Monthly (RoRo)~Not supplied~DGDA; OCC; Ministry of Commerce~Transit route and applicable inspections require local confirmation.
EG~Egypt~Africa~Max. 1 year old (verify)~Alexandria~21–28 days (container)~Weekly (container)~United Arab Shipping Agencies Co.~No inspection required (verify)~
ET~Ethiopia~Africa~No age limit~Djibouti, transit port~21–30 days (container)~Weekly (container)~Not supplied~No inspection required~Landlocked; confirm Djibouti transit and inland delivery.
GA~Gabon~Africa~Max. 3 years old (verify)~Libreville~34–44 days (RoRo)~Monthly (RoRo)~Not supplied~PROGEC~
GH~Ghana~Africa~Max. 10 years old (verify)~Tema~34–44 days (RoRo)~Monthly (RoRo)~Apex Shipping & Commercial Company Ltd.~No inspection required (verify)~
GM~Gambia~Africa~Max. 8 years old (verify)~Banjul~26–34 days (container)~Weekly (container)~Not supplied~ASYCUDA customs system~ASYCUDA is a customs system; confirm whether a separate inspection applies.
GN~Guinea~Africa~Max. 10 years old (verify)~Conakry~34–44 days (RoRo)~Monthly (RoRo)~Not supplied~Fiche de Demande d’Inspection~
KE~Kenya~Africa~Max. 8 years old (verify)~Mombasa~24–34 days (RoRo)~Monthly (RoRo)~K Line; MOL; Hoegh; Hyundai Glovis~QISJ / JEVIC (verify)~
LR~Liberia~Africa~Max. 10 years old (verify)~Monrovia~39–49 days (RoRo)~Monthly (RoRo)~Umarco Shipping Corporation~BIVAC (verify)~
LY~Libya~Africa~Max. 5 years old (verify)~Benghazi; Tripoli; Derna; Misurata~29–40 days (container)~Weekly (container)~Not supplied~Not supplied~
LS~Lesotho~Africa~No age limit~Durban (South Africa), transit port~24–34 days (RoRo)~Monthly (RoRo)~K Line Shipping South Africa Pty Ltd.~No inspection required~Inland delivery from Durban; confirm transit and border costs.
MG~Madagascar~Africa~Not supplied~Tamatave (Toamasina)~34–44 days (RoRo)~Monthly (RoRo)~Not supplied~BSC or CTN~
MW~Malawi~Africa~No age limit~Dar es Salaam (Tanzania), transit port~24–34 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required~Inland delivery; confirm corridor and onward transit.
ML~Mali~Africa~Not supplied~Inland destination; transit port to confirm~Not supplied~Not supplied~Not supplied~Not supplied~Landlocked. Nouakchott is in Mauritania; confirm the actual port and inland route.
MU~Mauritius~Africa~Max. 4 years old (verify)~Port Louis~19–24 days (RoRo)~Monthly (RoRo)~PAS (Mauritius) Ltd.~JEVIC and JAAI (verify)~
MR~Mauritania~Africa~Max. 8 years old (verify)~Nouakchott~34–44 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required (verify)~
MZ~Mozambique~Africa~No age restriction~Maputo~29–34 days (RoRo)~Monthly (RoRo)~Not supplied~Intertek (verify)~
NA~Namibia~Africa~Max. 12 years old (verify)~Durban; Walvis Bay~29–36 days (container)~Weekly (container)~Manica Group Namibia (Pty) Ltd.~No inspection required (verify)~
NE~Niger~Africa~Not supplied~Cotonou (Benin), transit port~34–46 days (RoRo)~Monthly (RoRo)~Not supplied~Not supplied~Landlocked; confirm inland transit to Niger.
NG~Nigeria~Africa~Max. 15 years old (verify)~Apapa; Lagos~34–44 days (RoRo)~Monthly (RoRo)~3MO Shipping & Trading Company Limited~No inspection required (verify)~
RW~Rwanda~Africa~No age limit~Dar es Salaam (Tanzania), transit port~24–34 days (RoRo)~Monthly (RoRo)~Hyundai Glovis~No inspection required~Inland delivery; confirm corridor and onward transit.
SN~Senegal~Africa~Max. 8 years old (verify)~Dakar~34–44 days (RoRo)~Monthly (RoRo)~Not supplied~Not supplied~
SH~St. Helena~Africa~Not supplied~Not supplied~Not supplied~Not supplied~Not supplied~Not supplied~
SO~Somalia~Africa~Not supplied~Berbera~36–46 days (container)~Weekly (container)~Not supplied~Not supplied~
SC~Seychelles~Africa~Max. 3 years old (verify)~Port of Victoria~28–39 days (container)~Monthly (container)~Not supplied~Not supplied~
ZA~South Africa~Africa~No age restriction (verify)~Durban~24–34 days (RoRo)~Monthly (RoRo)~The Keihin Co., Ltd.~No inspection required (verify)~
SD~Sudan~Africa~Not supplied~Sudan (port to confirm)~29–38 days (container)~Monthly (container)~Not supplied~No inspection required (verify)~
SZ~Eswatini (formerly Swaziland)~Africa~Max. 15 years old (verify)~Durban (South Africa), transit port~24–36 days (RoRo)~Monthly (RoRo)~The Keihin Co., Ltd.~No inspection required~Inland delivery from Durban; confirm transit and border costs.
SS~South Sudan~Africa~No age limit~Mombasa (Kenya), transit port~24–36 days (RoRo)~Monthly (RoRo)~Hyundai Glovis~EAA pre-shipment inspection (verify)~Inland delivery; confirm corridor and onward transit.
TG~Togo~Africa~No age limit~Lomé~34–44 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required (verify)~
UG~Uganda~Africa~Max. 15 years old (verify)~Mombasa (Kenya), transit port~24–34 days (RoRo)~Monthly (RoRo)~Hyundai Glovis~EAA (verify)~Inland delivery; confirm corridor and onward transit.
ZM~Zambia~Africa~No age limit~Dar es Salaam (Tanzania), transit port~24–34 days (RoRo)~Monthly (RoRo)~Hyundai (Fourway)~JEVIC (verify)~Inland delivery; confirm corridor and onward transit.
ZW~Zimbabwe~Africa~Max. 10 years old (verify)~Durban (South Africa), transit port~24–34 days (RoRo)~Monthly (RoRo)~Hoegh (Fourway Maritimes)~EAA (verify)~Inland delivery from Durban; confirm transit and border costs.
AF~Afghanistan~Asia~No age restriction (verify)~Karachi (Pakistan), transit port~16–26 days (RoRo)~Monthly (RoRo)~ECL / NYK~No inspection required (verify)~Inland delivery; confirm transit and border costs.
AU~Australia~Oceania~Max. 30 years old (verify)~Adelaide; Brisbane; Sydney~14–24 days (RoRo, estimate)~Weekly (RoRo)~Wilhelmsen Ships Service~Biosecurity / quarantine inspection~Vehicle import approvals and biosecurity requirements must be confirmed.
BD~Bangladesh~Asia~Max. 4 years old (verify)~Chittagong; Dhaka (inland)~19–24 days (RoRo, estimate)~Monthly (RoRo)~Not supplied~JAAI (verify)~Confirm port handling and inland delivery to Dhaka.
BT~Bhutan~Asia~Not supplied~Inland destination; transit route to confirm~Not supplied~Not supplied~Not supplied~Not supplied~Landlocked; confirm cross-border route.
BN~Brunei~Asia~More than 3 years old (verify exact rule)~Muara~13–20 days (RoRo)~Monthly (RoRo)~E&W Maritime Shipping & Trading Co.~No inspection required (verify)~
CN~China~Asia~Max. 10 years old (verify)~Tianjin; Shanghai; Dalian~10–15 days (container)~Weekly (container)~COSCO Shipping Lines Co.~Not supplied~
CK~Cook Islands~Oceania~Max. 10 years old (verify)~Arutanga Harbor; Arorangi Jetty~20–28 days (container)~Monthly (container)~Not supplied~Not required (verify)~
TL~Timor-Leste (East Timor)~Asia~Less than 5 years old (verify)~Dili~20–28 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required (verify)~
FJ~Fiji~Oceania~Max. 5 years old (verify)~Lautoka; Suva~34–44 days (RoRo)~Monthly (RoRo)~Shipping Services (Fiji) Ltd.~JEVIC (verify)~
PF~French Polynesia~Oceania~Not supplied~Papeete~21–31 days (method to confirm)~Not supplied~Not supplied~Not supplied~
GU~Guam~Oceania~No age restriction (verify)~Port of Guam~12–18 days (method to confirm)~Every 3–4 weeks~Not supplied~Not required (verify)~
HK~Hong Kong~Asia~Max. 7 years old (verify)~Hong Kong~9–14 days (RoRo)~Fortnightly (RoRo)~ZIM Integrated Shipping Services Ltd.; OOCL~No inspection required (verify)~
IN~India~Asia~Max. 3 years old (verify)~Chennai; Mumbai; Kolkata~19–24 days (RoRo, estimate)~Monthly (RoRo)~Naval Docks (verify)~Roadworthiness inspection (verify)~
ID~Indonesia~Asia~Not supplied~Tanjung Priok~11–23 days (RoRo)~Monthly (RoRo)~Not supplied~Not supplied~
KI~Kiribati~Oceania~No age restrictions (verify)~Tarawa Island~14–26 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required (verify)~
KW~Kuwait~Middle East~Max. 5 years old (verify)~Shuaiba~6–8 weeks (container)~Monthly (container)~Not supplied~Not supplied~
KG~Kyrgyzstan~Asia~Max. 10 years old (verify)~Bishkek (inland terminal; not a seaport)~34–36 days (container, estimate)~Weekly (container)~Not supplied~No inspection required (verify)~Landlocked; confirm border and inland route.
LA~Laos~Asia~No age restrictions (verify)~Inland destination; port/route to confirm~Not supplied~Not supplied~Not supplied~No inspection required (verify)~Landlocked; “Port of Laos” is not a seaport.
MO~Macau~Asia~Not supplied~Macau~7–10 days (container)~Weekly (container)~Not supplied~Not supplied~
FM~Micronesia~Oceania~No age restrictions (verify)~Port of Yap~34–46 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required (verify)~
MY~Malaysia~Asia~Max. 5 years old (verify)~Penang (Georgetown); Port Klang~9–13 days (container)~Weekly (container)~Not supplied~Not supplied~
MM~Myanmar~Asia~Max. 5 years old (verify)~Yangon~13–22 days (container)~Weekly (container)~S.R Shipping (Myanmar) Co., Ltd~No inspection required (verify)~
MN~Mongolia~Asia~No age limit (verify)~Ulaanbaatar (inland destination; not a seaport)~13–20 days (container, estimate)~Weekly (container)~Shipping Line Mongolia LLC~No inspection required (verify)~Landlocked; confirm rail/road transit and inland delivery.
NZ~New Zealand~Oceania~No age restriction (verify)~Auckland; Lyttelton; Nelson~14–24 days (RoRo, estimate)~Monthly (RoRo)~COSCO Shipping Lines Ltd.; Armacup Maritime Service~JEVIC and MAF (verify)~
NC~New Caledonia~Oceania~No age restrictions (verify)~Nouméa~34–46 days (RoRo)~Monthly (RoRo)~Not supplied~Not supplied~
NR~Nauru~Oceania~No age restrictions (verify)~Nauru~15–24 days (method to confirm)~Weekly~Not supplied~No inspection required (verify)~
PG~Papua New Guinea~Oceania~No age limit (verify)~Lae; Rabaul; Port Moresby~34–44 days (RoRo)~Monthly (RoRo)~Deugro (PNG) Ltd.~JEVIC (verify)~
PH~Philippines~Asia~No age restrictions (verify)~Manila; Subic Bay; Port Irene~5–8 days (container, estimate)~Weekly (container)~Not supplied~PIA (verify)~
SG~Singapore~Asia~Max. 3 years old (verify)~Singapore~9–14 days (RoRo)~Fortnightly (RoRo)~Samudera Shipping Line Pte Ltd.~No inspection required (verify)~
SB~Solomon Islands~Oceania~No age restrictions (verify)~Honiara~14–20 days (container)~Weekly (container)~Not supplied~No inspection required (verify)~
WS~Samoa~Oceania~Max. 8 years old (verify)~Apia~20–26 days (RoRo)~Weekly (RoRo)~Not supplied~No inspection required (verify)~
KR~South Korea~Asia~No age limit (verify)~Busan~20–30 days (RoRo)~Weekly (RoRo)~Hyundai Merchant Marine (HMM)~No inspection required (verify)~
TZ~Tanzania~Africa~No age limit (verify)~Dar es Salaam~24–34 days (RoRo)~Monthly (RoRo)~Hoegh Autoliners~EAA (verify)~
LK~Sri Lanka~Asia~Max. 3 years old (verify)~Colombo; Hambantota~14–24 days (RoRo)~Fortnightly (RoRo)~K-Line; MOL~JAAI (verify)~
TW~Taiwan~Asia~Max. 10 years old (verify)~Keelung~5–9 days (method to confirm)~Not supplied~ZIM Integrated Shipping Ltd.~Not supplied~
TK~Tokelau~Oceania~Not supplied~Apia (Samoa), transit port~Fortnightly (schedule provided; transit time not supplied)~Fortnightly~Not supplied~Not supplied~Confirm onward connection and final island delivery.
TO~Tonga~Oceania~No age restrictions (verify)~Nukuʻalofa~21–25 days (RoRo)~Weekly (RoRo)~Pacific Forum Line~No inspection required (verify)~
TH~Thailand~Asia~No age limit (verify)~Bangkok; Laem Chabang~14–19 days (RoRo)~Monthly (RoRo)~Thailand Star Shipping~No inspection required (verify)~
VN~Vietnam~Asia~Max. 5 years old (verify)~Ho Chi Minh City~10–17 days (container)~Weekly (container)~Ben Line Agencies Vietnam~Not supplied~
VU~Vanuatu~Oceania~Not supplied~Vila~16–22 days (method to confirm)~Not supplied~Belair Shipping Vanuatu~Not supplied~
AR~Argentina~Americas~No age limit (verify)~Buenos Aires~37–44 days (container)~Weekly (container)~Not supplied~Not supplied~
AG~Antigua & Barbuda~Caribbean~No age limit (verify)~St. John’s~24–34 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required (verify)~
BO~Bolivia~Americas~Max. 1 year old (verify)~Iquique (Chile), transit port~Not supplied~Not supplied~Not supplied~Not supplied~Landlocked; confirm Chilean transit and inland delivery.
BM~Bermuda~Caribbean~Max. 4 years old (verify)~Hamilton~24–36 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required (verify)~
VG~British Virgin Islands~Caribbean~No age limit (verify)~Road Town~3–4 weeks (RoRo)~Weekly (RoRo)~Not supplied~No inspection required (verify)~
BR~Brazil~Americas~Not supplied~Santos (corrected; confirm final discharge port)~37–46 days (container, estimate)~Weekly (container, estimate)~Not supplied~Not supplied~Source listed Hamilton, which is in Bermuda; Santos is a Brazilian port.
CL~Chile~Americas~Max. 5 years old (verify)~Arica; Iquique; Valparaíso~24–34 days (RoRo)~Monthly (RoRo)~The Keihin Co., Ltd.~No inspection required (verify)~
KY~Cayman Islands~Caribbean~No age limit (verify)~George Town~29–36 days (RoRo)~Less than twice monthly (RoRo, verify)~Not supplied~No inspection required (verify)~
CO~Colombia~Americas~Not supplied~Cartagena~31–41 days (RoRo)~Less than twice monthly (RoRo, verify)~Not supplied~Not supplied~
CR~Costa Rica~Americas~No age limit (verify)~Limón/Moín; Caldera (corrected)~31–41 days (RoRo, estimate)~Monthly (RoRo, verify)~Not supplied~No inspection required (verify)~Source listed Bridgetown, which is in Barbados; verify actual discharge port with carrier.
DM~Dominica~Caribbean~Max. 5 years old (verify)~Roseau~24–34 days (RoRo)~Monthly (RoRo)~CNC Japan (ECL)~No inspection required (verify)~
DO~Dominican Republic~Caribbean~Max. 10 years old (verify)~Santo Domingo~24–36 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required (verify)~
FK~Falkland Islands~Americas~Not supplied~Stanley~36–44 days (container)~Monthly (container)~Not supplied~Not supplied~
GD~Grenada~Caribbean~No age limit (verify)~St. George’s~24–39 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required (verify)~
GT~Guatemala~Americas~Max. 10 years old (verify)~Puerto Quetzal~24–36 days (RoRo)~Less than twice monthly (RoRo, verify)~Not supplied~No inspection required (verify)~
GY~Guyana~Caribbean~Max. 8 years old (verify)~Georgetown~24–34 days (RoRo)~Less than twice monthly (RoRo, verify)~Yuwa; Hoegh; MOL~ATJ inspection (verify)~
HT~Haiti~Caribbean~No age limit (verify)~Port-au-Prince~17–26 days (method to confirm)~Weekly (container)~Not supplied~No inspection required (verify)~
PE~Peru~Americas~Max. 5 years old (verify)~Matarani~24–36 days (RoRo)~Monthly (RoRo)~Not supplied~Inspection required (verify)~
MV~Maldives~Asia~No age restrictions (verify)~Malé~21–30 days (method to confirm)~Weekly~Asia Forwarding Pvt. Ltd.~No inspection required (verify)~
PR~Puerto Rico~Caribbean~No age limit (verify)~San Juan~29–42 days (container)~Weekly (container)~Not supplied~No inspection required (verify)~
PY~Paraguay~Americas~Max. 10 years old (verify)~Asunción (inland/river destination; ocean transit port to confirm)~26–36 days (container, estimate)~Monthly (container)~Not supplied~SGS and Bureau Veritas (verify)~Landlocked; confirm ocean transit port and inland route.
SR~Suriname~Caribbean~Max. 8 years old (verify)~Paramaribo~39–44 days (RoRo)~Less than twice monthly (RoRo, verify)~Yuwa Shipping Co., Ltd.~No inspection required (verify)~
VC~St. Vincent and the Grenadines~Caribbean~No age restrictions (verify)~Kingstown~31–41 days (RoRo)~Monthly (RoRo)~Not supplied~No inspection required (verify)~
TT~Trinidad & Tobago~Caribbean~Max. 4 years old (verify)~Port of Spain~24–34 days (RoRo)~Monthly (RoRo)~CNC Japan (ECL)~No inspection required (verify)~
TC~Turks & Caicos Islands~Caribbean~Max. 10 years old (verify)~Providenciales~28–39 days (container)~Less than twice monthly (container, verify)~Not supplied~No inspection required (verify)~
KN~Saint Kitts & Nevis~Caribbean~No years restriction (verify)~Basseterre (St. Kitts); Charlestown or Long Point (Nevis) (corrected)~30–45 days (method to confirm)~Twice monthly; dates vary (verify)~Waitara (verify)~No inspection required (verify)~Source listed Auckland and Wellington, which are in New Zealand.
PW~Palau~Oceania~No age restrictions (verify)~Angaur~17–26 days (container)~Weekly (container)~Palau Shipping Company Inc.~No inspection required (verify)~
AT~Austria~Europe~No restrictions (verify)~Vienna (inland destination; port/route to confirm)~34–41 days (container, estimate)~Weekly (container)~Mediterranean Shipping Company~Not supplied~Landlocked; confirm ocean transit port and inland delivery.
BE~Belgium~Europe~Not supplied~Antwerp; Zeebrugge~29–34 days (RoRo)~Less than twice monthly (RoRo, verify)~Not supplied~Not supplied~
BY~Belarus~Europe~No age limit (verify)~Port/route to confirm~Not supplied~Not supplied~Not supplied~No inspection required (verify)~
CY~Cyprus~Europe~Max. 5 years old (verify)~Limassol~26–36 days (RoRo)~Less than twice monthly (RoRo, verify)~Columbia Ship Management Ltd.~No inspection required (verify)~
CZ~Czech Republic~Europe~Less than 5 years old (verify)~Prague (inland destination; port/route to confirm)~35–45 days (estimate)~Weekly (verify)~ZIM Integrated Shipping Services Ltd.~Not supplied~Landlocked; confirm ocean transit port and inland delivery.
DK~Denmark~Europe~Not supplied~Frederikshavn~26–36 days (RoRo)~Monthly (RoRo)~UAA Denmark~Not supplied~
EE~Estonia~Europe~Not supplied~Tallinn~36–42 days (method to confirm)~Weekly (verify)~Hansa Ship Management OÜ~Not supplied~
FR~France~Europe~Not supplied~Fos-sur-Mer; Le Havre~24–34 days (RoRo)~Monthly (RoRo)~ZIM Integrated Shipping Services Ltd.; CMA CGM~No inspection required (verify)~
FI~Finland~Europe~Not supplied~Kotka~26–36 days (RoRo)~Monthly (RoRo)~Greencarrier Liner Agency Finland Oy~Not supplied~
IE~Ireland~Europe~Not supplied~Dublin~24–34 days (RoRo)~Monthly (RoRo)~Irish Shipping & Transport Ltd.~NCT (verify)~
IT~Italy~Europe~Not supplied~Savona; La Spezia; Livorno~27–34 days (container)~Weekly (container)~Agenzia Marittima Le Navi~No inspection required (verify)~
LV~Latvia~Europe~No age limit (verify)~Freeport of Riga~29–36 days (container)~Weekly (container)~Amber Shipping Line~Not supplied~
LT~Lithuania~Europe~Not supplied~Klaipėda~31–38 days (method to confirm)~Weekly (verify)~Limarko~Not supplied~
NO~Norway~Europe~Not supplied~Drammen; Oslo~24–34 days (RoRo)~Weekly (container; confirm mode)~GAC Norway AS~No inspection required (verify)~
AE~United Arab Emirates~Middle East~Max. 4 years old (verify)~Jebel Ali; Abu Dhabi; Sharjah~19–29 days (RoRo)~Monthly (RoRo)~Hyundai Glovis~No inspection required (verify)~
NL~Netherlands~Europe~Not supplied~Rotterdam~31–41 days (RoRo)~Less than twice monthly (RoRo, verify)~NileDutch~No inspection required (verify)~
MD~Moldova~Europe~No age limit (verify)~Giurgiulești~Not supplied~Not supplied~Not supplied~No inspection required (verify)~
PL~Poland~Europe~Not supplied~Gdynia; Gdańsk~33–40 days (method to confirm)~Weekly (container)~Euroafrica Shipping Lines~No inspection required (verify)~
RO~Romania~Europe~Not more than 8 years old (verify)~Constanța~29–36 days (container)~Weekly (container)~Cosco Romanian Shipping and Trading~Not supplied~
RU~Russia~Europe~Max. 5 years old (verify)~St. Petersburg; Vladivostok~3–5 days (source estimate; verify)~Weekly (RoRo)~Not supplied~No inspection required (verify)~
ES~Spain~Europe~Not supplied~Barcelona; Pasaia; Santander~34–41 days (container)~Weekly (container)~Arkas Spain~ITV (verify)~
SI~Slovenia~Europe~Not supplied~Port/route to confirm~Not supplied~Not supplied~Not supplied~Not supplied~
SE~Sweden~Europe~Not supplied~Gothenburg~36–46 days (RoRo)~Less than twice monthly (RoRo, verify)~Sweden Transport & Logistic Shipping AB~Not supplied~
CH~Switzerland~Europe~Not supplied~Geneva; Zurich (inland destinations; port/route to confirm)~34–41 days (container, estimate)~Weekly (container)~Enzian Ship Management~Not supplied~Landlocked; confirm ocean transit port and inland delivery.
GB~United Kingdom~Europe~Less than 10 years old (verify)~Bristol; Liverpool; Southampton~24–34 days (RoRo)~Monthly (RoRo)~Mediterranean Shipping Co (UK) Ltd.~SVA or IVA (verify)~
BH~Bahrain~Middle East~Max. 5 years old (verify)~Bahrain~22–31 days (method to confirm)~Weekly (verify)~Not supplied~Not supplied~
GE~Georgia~Middle East~No age restriction (verify)~Poti~34–46 days (container)~Monthly (container)~Maersk; CMA CGM~No inspection required (verify)~
IR~Iran~Middle East~Max. 3 years old (verify)~Bandar Abbas; Bushehr~29–38 days (RoRo)~Twice monthly (verify)~Not supplied~Not supplied~
IQ~Iraq~Middle East~Max. 2 years old (verify)~Umm Qasr~29–34 days (container)~Weekly (container)~Not supplied~Not supplied~
JO~Jordan~Middle East~Max. 10 years old (verify)~Aqaba~24–33 days (container)~Weekly (container)~Not supplied~Not supplied~
KZ~Kazakhstan~Asia~Max. 5 years old (verify)~Aktau~24–26 days (container)~Weekly (container)~Not supplied~Not supplied~
LB~Lebanon~Middle East~Max. 8 years old (verify)~Beirut~34–46 days (container)~Monthly (container)~Not supplied~Not supplied~
OM~Oman~Middle East~Max. 10 years old (verify)~Muscat (port to confirm)~29–34 days (method to confirm)~Less than twice monthly (verify)~Not supplied~Not supplied~
QA~Qatar~Middle East~Max. 5 years old (verify)~Doha (port to confirm)~20–29 days (container)~Weekly (container)~Not supplied~Fahes (verify)~
SA~Saudi Arabia~Middle East~Max. 5 years old (verify)~Dammam~34–46 days (container)~Twice monthly (verify)~Not supplied~No inspection (verify)~
TR~Turkey~Middle East~Not supplied~Port/route to confirm~Not supplied~Not supplied~Not supplied~Not supplied~
\`.trim();

export const EXPORT_MARKET_SHIPPING_GUIDES: ExportMarketShippingGuide[] = SOURCE.split('\n').map((line) => {
  const [code, name, region, yearRestriction, destinationPort, transitTime, vesselSchedule, shippingLine, inspection, routeNote] =
    line.split('~');
  return {
    code,
    name,
    region,
    yearRestriction,
    destinationPort,
    transitTime,
    vesselSchedule,
    shippingLine,
    inspection,
    ...(routeNote ? { routeNote } : {}),
  };
});

export const EXPORT_MARKET_SHIPPING_GUIDE_BY_CODE = Object.fromEntries(
  EXPORT_MARKET_SHIPPING_GUIDES.map((guide) => [guide.code, guide])
);

export const ADDITIONAL_EXPORT_MARKETS = EXPORT_MARKET_SHIPPING_GUIDES.map((guide) => ({
  code: guide.code,
  name: guide.name,
  region: guide.region,
  defaultImportNotes: 'See the indicative country shipping guide below. Confirm current requirements with local customs and the carrier.',
}));
