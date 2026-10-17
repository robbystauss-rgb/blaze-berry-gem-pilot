import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Check, Pencil, Archive, RefreshCw } from "lucide-react";
import {
  getOwnerTasks,
  updateOwnerTask,
  getOwnerDashboardInsights,
} from "@/lib/commerce/owner-tasks-api";
import type { OwnerTask } from "@/lib/commerce/owner-tasks.server";
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Unable to load business tasks.";
const dueLabel = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "America/Chicago" });
type TaskForm = {
  id: string;
  version: number;
  title: string;
  details: string;
  dueDate: string;
  priority: OwnerTask["priority"];
  state: OwnerTask["state"];
};
const blank = (): TaskForm => ({
  id: crypto.randomUUID(),
  version: 0,
  title: "",
  details: "",
  dueDate: "",
  priority: "normal",
  state: "open",
});
export function OwnerTasks() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getOwnerTasks>> | null>(null),
    [state, setState] = useState<"open" | "done" | "archived" | "all">("open"),
    [search, setSearch] = useState(""),
    [form, setForm] = useState<TaskForm | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await getOwnerTasks({ data: { state, search } }));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [state, search]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);
  async function save(input: TaskForm) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await updateOwnerTask({ data: { ...input, dueDate: input.dueDate || null } });
      setForm(null);
      setStatus(
        input.state === "archived"
          ? "Task archived."
          : input.state === "done"
            ? "Task completed."
            : "Task saved.",
      );
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const edit = (t: OwnerTask): TaskForm => ({
    id: t.id,
    version: t.version,
    title: t.title,
    details: t.details,
    dueDate: t.due_date ?? "",
    priority: t.priority,
    state: t.state,
  });
  return (
    <section className="cc-panel cc-owner-tasks" aria-labelledby="owner-tasks-title">
      <div className="cc-panel-heading">
        <div>
          <h2 id="owner-tasks-title">Business tasks</h2>
          <p className="cc-help">
            Private business reminders. Order fulfillment stays in the production queue.
          </p>
        </div>
        <div className="cc-actions">
          <button
            className="cc-button secondary"
            onClick={() => void load()}
            disabled={busy}
            aria-label="Refresh business tasks"
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="cc-button"
            disabled={busy}
            onClick={() => {
              setForm(blank());
              setStatus("");
            }}
          >
            <Plus size={16} />
            Add business task
          </button>
        </div>
      </div>
      {data && (
        <p className="cc-help">
          All time: {data.summary.open} open · {data.summary.overdue} overdue · {data.summary.done}{" "}
          completed · {data.summary.archived} archived. Due dates use America/Chicago.
        </p>
      )}
      <div className="cc-form-grid">
        <label className="cc-field">
          Task view
          <select
            aria-label="Task view"
            value={state}
            disabled={busy}
            onChange={(e) => setState(e.target.value as typeof state)}
          >
            <option value="open">Open</option>
            <option value="done">Completed</option>
            <option value="archived">Archived</option>
            <option value="all">All tasks</option>
          </select>
        </label>
        <label className="cc-field">
          Find a task
          <input
            aria-label="Find a task"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="cc-success" role="status">
          {status}
        </p>
      )}
      {form && (
        <form
          className="cc-form cc-task-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              form.state === "archived" &&
              !window.confirm("Archive this business task? It stays in history.")
            )
              return;
            void save(form);
          }}
        >
          <h3>{form.version ? "Edit business task" : "New business task"}</h3>
          <label className="cc-field">
            Task title
            <input
              aria-label="Task title"
              required
              minLength={3}
              maxLength={180}
              value={form.title}
              disabled={busy}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="cc-field">
            Private task notes
            <textarea
              aria-label="Private task notes"
              rows={3}
              maxLength={2000}
              value={form.details}
              disabled={busy}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
            />
          </label>
          <div className="cc-form-grid">
            <label className="cc-field">
              Due date
              <input
                aria-label="Task due date"
                type="date"
                value={form.dueDate}
                disabled={busy}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </label>
            <label className="cc-field">
              Priority
              <select
                aria-label="Task priority"
                value={form.priority}
                disabled={busy}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as TaskForm["priority"] })
                }
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="cc-field">
              Status
              <select
                aria-label="Task status"
                value={form.state}
                disabled={busy || !form.version}
                onChange={(e) => setForm({ ...form, state: e.target.value as TaskForm["state"] })}
              >
                <option value="open">Open</option>
                <option value="done">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <div className="cc-actions">
            <button className="cc-button" disabled={busy}>
              {busy ? "Saving…" : "Save business task"}
            </button>
            <button
              type="button"
              className="cc-button secondary"
              disabled={busy}
              onClick={() => setForm(null)}
            >
              Cancel task edit
            </button>
          </div>
        </form>
      )}
      {!data && !error ? (
        <p role="status">Loading business tasks…</p>
      ) : data?.tasks.length ? (
        <div className="cc-records">
          {data.tasks.map((task) => (
            <div key={task.id} className="cc-task-row">
              <div>
                <b>{task.title}</b>
                <small>
                  {task.priority} priority ·{" "}
                  {task.due_date ? "Due " + dueLabel(task.due_date) : "No due date"} · {task.state}
                </small>
                {task.details && <p className="cc-task-notes">{task.details}</p>}
              </div>
              <div className="cc-actions">
                <button
                  className="cc-button secondary"
                  disabled={busy}
                  onClick={() => setForm(edit(task))}
                  aria-label={`Edit task ${task.title}`}
                >
                  <Pencil size={16} />
                  Edit
                </button>
                {task.state === "open" && (
                  <button
                    className="cc-button secondary"
                    disabled={busy}
                    onClick={() => void save({ ...edit(task), state: "done" })}
                    aria-label={`Complete task ${task.title}`}
                  >
                    <Check size={16} />
                    Complete
                  </button>
                )}
                {task.state !== "archived" && (
                  <button
                    className="cc-button secondary"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Archive this business task? It stays in history."))
                        void save({ ...edit(task), state: "archived" });
                    }}
                    aria-label={`Archive task ${task.title}`}
                  >
                    <Archive size={16} />
                    Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="cc-help">
          No tasks in this view. Add a real business reminder when you have work to track.
        </p>
      )}
      <p className="cc-help">
        Showing up to 200 matching tasks. Completed and archived tasks remain searchable; every
        change is audited.
      </p>
    </section>
  );
}

export function OwnerDashboardInsights() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getOwnerDashboardInsights>> | null>(
      null,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getOwnerDashboardInsights()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <section className="cc-panel">
        <p role="alert">{error}</p>
      </section>
    );
  if (!data)
    return (
      <section className="cc-panel">
        <p role="status">Loading campaign reminders and recent uploads…</p>
      </section>
    );
  const dateTime = (value: string) =>
    new Date(value).toLocaleString("en-US", {
      timeZone: "America/Chicago",
      dateStyle: "medium",
      timeStyle: "short",
    });
  return (
    <div className="cc-overview-grid">
      <section className="cc-panel">
        <div className="cc-panel-heading">
          <h2>Campaign reminders</h2>
          <Link className="cc-link" to="/admin" search={{ section: "promotions" }}>
            Manage promotions
          </Link>
        </div>
        <p className="cc-help">Starts or expires in the next 30 days · America/Chicago.</p>
        {data.promotions.length ? (
          <div className="cc-records">
            {data.promotions.map((p) => (
              <div key={p.id}>
                <span>
                  <b>{p.code}</b>
                  <small>{p.campaign}</small>
                </span>
                <span>
                  {p.upcoming && p.starts_at
                    ? "Starts " + dateTime(p.starts_at)
                    : p.ends_at
                      ? "Expires " + dateTime(p.ends_at)
                      : "Active"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="cc-help">No active campaigns start or expire in the next 30 days.</p>
        )}
      </section>
      <section className="cc-panel">
        <div className="cc-panel-heading">
          <h2>Recent photo uploads</h2>
          <Link className="cc-link" to="/admin" search={{ section: "gallery" }}>
            Open photo library
          </Link>
        </div>
        <p className="cc-help">Latest six available uploads · private owner view.</p>
        {data.uploads.length ? (
          <div className="cc-records">
            {data.uploads.map((m) => (
              <div key={m.id}>
                <img
                  className="cc-task-thumb"
                  src={`/api/media/${m.id}?thumbnail=1`}
                  alt={m.alt || "Private uploaded photo"}
                />
                <span>
                  <b>{m.name}</b>
                  <small>{dateTime(m.created_at)}</small>
                  {!m.alt && <small>Alt text needed before publication</small>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="cc-help">
            No photos uploaded yet. Upload finished work through the photo library.
          </p>
        )}
      </section>
    </div>
  );
}
