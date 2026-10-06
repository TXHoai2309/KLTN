import React from "react";
import "./explore.css";
import { DestinationResultStatus } from "./destination-search-form";
export default function Loading() { return <main className="explore-page" lang="vi"><h1>Khám phá Hà Giang</h1><section className="explore-domain"><DestinationResultStatus state={{ status: "loading" }} filtered={false} /></section><section className="explore-state explore-domain" role="status" aria-busy="true">Đang tải nội dung văn hóa…</section></main>; }
