import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section wrap">
      <h1>Page not found</h1>
      <p className="lede">There is nothing at this address. The recorded run, the bugs and the live model modes are linked from the menu above.</p>
      <p><Link className="chip" href="/">Back to the home page</Link> <Link className="chip" href="/bugs">See the 4 bugs and their proof</Link></p>
    </section>
  );
}
