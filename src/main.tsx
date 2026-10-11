import React, {
  useState,
  useEffect,
  type ReactNode,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Task = { id: number; title: string; status: string; priority: string };
type Product = {
  id: number;
  sku: string;
  name: string;
  quantity: number;
  threshold: number;
  low_stock: number;
};
type Movement = { id: number; name: string; note: string; delta: number };
type BookingRecord = {
  id: number;
  resource: string;
  guest: string;
  starts_at: string;
  ends_at: string;
};
type Expense = {
  id: number;
  label: string;
  payer: string;
  cents: number;
  participants: string[];
};
type Balance = { person: string; cents: number };
type Settlement = { from: string; to: string; cents: number };
type Inbox = { id: string; name: string; secret: string };
type CapturedEvent = {
  id: number;
  event_key: string;
  body: string;
  received_at: string;
};
type DocumentRecord = { id: number; title: string; body: string };
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api" + path, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
function useLoad<T>(path: string, revision: number) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api" + path, { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, error };
}
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="notice" role="alert">
      {children}
    </p>
  );
}
function Field({
  label,
  name,
  type = "text",
  placeholder,
  required = true,
  min,
  step,
  children,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: string;
  step?: string;
  children?: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children ? (
        <select aria-label={label} name={name} required={required}>
          {children}
        </select>
      ) : type === "textarea" ? (
        <textarea
          aria-label={label}
          name={name}
          placeholder={placeholder}
          required={required}
          rows={5}
        />
      ) : (
        <input
          aria-label={label}
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
          min={min}
          step={step}
        />
      )}
    </label>
  );
}
function Form({
  title,
  children,
  submit,
  onSubmit,
}: {
  title: string;
  children: ReactNode;
  submit: string;
  onSubmit: (f: FormData) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await onSubmit(new FormData(form));
      form.reset();
      setSuccess("Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>{title}</h2>
      <form onSubmit={send}>
        {children}
        {error && <Notice>{error}</Notice>}
        <div className="form-footer">
          <button disabled={busy}>{busy ? "Saving…" : submit}</button>
          {success && <span role="status">{success}</span>}
        </div>
      </form>
    </section>
  );
}
type Props = { revision: number; refresh: () => void };
function Inventory({ revision, refresh }: Props) {
  const products = useLoad<Product[]>("/products", revision),
    moves = useLoad<Movement[]>("/stock-moves", revision);
  return (
    <>
      <div className="stats">
        <Stat label="Products" value={products.data?.length ?? 0} />
        <Stat
          label="Units on hand"
          value={products.data?.reduce((n, p) => n + p.quantity, 0) ?? 0}
        />
        <Stat
          label="Need replenishment"
          value={products.data?.filter((p) => p.low_stock).length ?? 0}
        />
      </div>
      <div className="two">
        <Form
          title="Add a product"
          submit="Create product"
          onSubmit={async (f) => {
            await api("/products", "POST", {
              sku: f.get("sku"),
              name: f.get("name"),
              quantity: Number(f.get("quantity")),
              threshold: Number(f.get("threshold")),
            });
            refresh();
          }}
        >
          <Field label="Product name" name="name" placeholder="USB-C cable" />
          <div className="form-row">
            <Field label="SKU" name="sku" placeholder="CB-405" />
            <Field
              label="Opening quantity"
              name="quantity"
              type="number"
              min="0"
              step="1"
            />
          </div>
          <Field
            label="Reorder threshold"
            name="threshold"
            type="number"
            min="0"
            step="1"
          />
        </Form>
        <Form
          title="Record stock movement"
          submit="Save movement"
          onSubmit={async (f) => {
            await api("/products/" + f.get("product") + "/moves", "POST", {
              delta: Number(f.get("delta")),
              note: f.get("note"),
            });
            refresh();
          }}
        >
          <Field label="Product" name="product">
            {products.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.quantity} in stock)
              </option>
            ))}
          </Field>
          <Field
            label="Quantity change (+ receive / − consume)"
            name="delta"
            type="number"
            step="1"
          />
          <Field
            label="Reason"
            name="note"
            placeholder="Received shipment / used in workshop"
          />
          <p className="hint">
            Changes and the audit entry are committed in one transaction.
          </p>
        </Form>
      </div>
      {products.error && <Notice>{products.error}</Notice>}
      <section className="panel">
        <h2>Stock overview</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>On hand</th>
                <th>Reorder at</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.data?.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="mono">{p.sku}</td>
                  <td>{p.quantity}</td>
                  <td>{p.threshold}</td>
                  <td>
                    <span className={"badge " + (p.low_stock ? "high" : "low")}>
                      {p.low_stock ? "Reorder" : "Healthy"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Movement history</h2>
        {moves.error && <Notice>{moves.error}</Notice>}
        {!moves.data?.length ? (
          <p className="hint">Record a movement to see its audit trail here.</p>
        ) : (
          moves.data.map((m) => (
            <div className="row" key={m.id}>
              <div>
                <strong>{m.name}</strong>
                <p>{m.note}</p>
              </div>
              <span className="mono">
                {m.delta > 0 ? "+" : ""}
                {m.delta}
              </span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function App(){
      const [revision,setRevision]=useState(0);
      return <div className="shell"><aside><a className="brand" href="#"><span className="brand-mark">S</span><span>Stockroom<small>OPEN SOURCE APPLICATION</small></span></a><p className="nav-label">OPERATIONS</p><div className="sidebar-note"><b>Built to explore.</b><p>React · TypeScript · Node.js<br/>SQLite · Playwright</p><span>v0.1 · Local demo</span></div></aside><main><div className="topline"><span>STOCKROOM / OPERATIONS</span><span className="local-tag">LOCAL DEMO</span></div><header><p className="eyebrow">OPEN SOURCE / OPERATIONS</p><h1>Stockroom</h1><p className="lead">Transactional inventory adjustments with movement audit logs.</p></header><Inventory revision={revision} refresh={()=>setRevision(v=>v+1)}/><footer>Stockroom · MIT licensed source · AI-assisted local demo</footer></main></div>;
    }
    createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
    