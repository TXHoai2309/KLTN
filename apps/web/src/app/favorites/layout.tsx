import { Be_Vietnam_Pro, Noto_Serif } from "next/font/google";
import "./favorites.css";
const body=Be_Vietnam_Pro({weight:["400","500","600"],subsets:["latin","vietnamese"],variable:"--font-favorite-body",display:"swap"});
const heading=Noto_Serif({weight:"600",subsets:["latin","vietnamese"],variable:"--font-favorite-heading",display:"swap"});
export default function FavoritesLayout({children}:{children:React.ReactNode}) {return <div className={`favorites-shell ${body.variable} ${heading.variable}`}>{children}</div>;}
