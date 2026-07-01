"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Upload,
  Wand2
} from "lucide-react";
import { PageTitle } from "./app-shell";
import { Button, Card, CardHeader, EmptyState, SafetyNotice, StatusBadge } from "./ui";
import { predictOCT } from "@/lib/ai-api";
import { useDemoStore } from "@/lib/demo-store";
import { downloadReportPdf } from "@/lib/pdf";
import { reportTemplates } from "@/lib/report-templates";
import type { DiseaseClass, EyeSide, Gender, Patient, Report } from "@/lib/types";

const diseaseClasses: DiseaseClass[] = ["CNV", "DME", "DRUSEN", "NORMAL"];

export function LoginView() {
  const router = useRouter();
  const store = useDemoStore();
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("doctor@octai.local");
  const [password, setPassword] = useState("demo-password");
  const [fullName, setFullName] = useState("");
  const [clinicName, setClinicName] = useState("OCT AI Clinic");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (authMode === "signup") {
        await store.signUp({
          email,
          password,
          fullName: fullName || email.split("@")[0],
          clinicName
        });
      } else {
        await store.login(email, password);
      }
      router.push("/dashboard");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Invalid login.";
      if (/account created/i.test(text)) {
        setMessage(text);
      } else {
        setError(text);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1fr_520px]">
      <section className="hidden bg-[linear-gradient(135deg,#0f6170,#2563eb)] px-14 py-16 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="mb-10 flex h-12 w-12 items-center justify-center rounded-md bg-white/15">
            <Eye size={26} />
          </div>
          <h1 className="max-w-xl text-4xl font-black leading-tight">
            AI-assisted OCT report workflow for clinical review.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/82">
            Create patients, upload OCT images, run demo AI analysis, edit standardized reports, and approve only after doctor review.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {["CNV", "DME", "DRUSEN", "NORMAL"].map((item) => (
            <div key={item} className="rounded-lg bg-white/10 p-4 backdrop-blur">
              <p className="text-2xl font-black">{item}</p>
              <p className="text-white/70">classification template</p>
            </div>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center px-5">
        <Card className="w-full max-w-md p-6">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wide text-clinic-700">Secure clinical workspace</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">{authMode === "signin" ? "Sign in" : "Create account"}</h2>
            <p className="mt-1 text-sm text-slate-500">Use demo credentials for local testing, or use a real confirmed Supabase email account.</p>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
              <button
                className={`rounded px-3 py-2 text-sm font-bold ${authMode === "signin" ? "bg-white text-clinic-700 shadow-sm" : "text-slate-500"}`}
                onClick={() => setAuthMode("signin")}
              >
                Sign in
              </button>
              <button
                className={`rounded px-3 py-2 text-sm font-bold ${authMode === "signup" ? "bg-white text-clinic-700 shadow-sm" : "text-slate-500"}`}
                onClick={() => {
                  setAuthMode("signup");
                  if (email.endsWith(".local")) {
                    setEmail("");
                    setPassword("");
                  }
                }}
              >
                Create account
              </button>
            </div>
            <div>
              <label className="label">Email</label>
              <input className="field mt-1" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="field mt-1"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {authMode === "signup" ? (
              <>
                <div>
                  <label className="label">Full name</label>
                  <input className="field mt-1" value={fullName} onChange={(event) => setFullName(event.target.value)} />
                </div>
                <div>
                  <label className="label">Clinic name</label>
                  <input className="field mt-1" value={clinicName} onChange={(event) => setClinicName(event.target.value)} />
                </div>
              </>
            ) : null}
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
            {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
            <Button className="w-full" onClick={submit} disabled={loading || !email || !password}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : null}
              {authMode === "signin" ? "Login" : "Create Supabase Account"}
            </Button>
            <div className="flex justify-between text-sm">
              <Link href="/forgot-password" className="font-semibold text-clinic-700">
                Forgot password?
              </Link>
              <button
                className="font-semibold text-slate-500"
                onClick={() => {
                  setAuthMode("signin");
                  setEmail("admin@octai.local");
                  setPassword("demo-password");
                }}
              >
                Use admin
              </button>
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}

export function ForgotPasswordView() {
  const store = useDemoStore();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendReset = async () => {
    setError("");
    setSent(false);
    setLoading(true);
    try {
      await store.resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Reset password"
      subtitle="Enter your Supabase account email and we will send a reset link."
      action={
        <>
          <input className="field" placeholder="doctor@clinic.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Button className="w-full" onClick={sendReset} disabled={loading || !email}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : null}
            Send reset link
          </Button>
          {sent ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">Reset link sent. Check your email.</p> : null}
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
        </>
      }
    />
  );
}

export function ResetPasswordView() {
  const router = useRouter();
  const store = useDemoStore();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const updatePassword = async () => {
    setError("");
    setMessage("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await store.updatePassword(password);
      setMessage("Password updated. You can sign in now.");
      window.setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create new password"
      subtitle="Enter the new password after opening the Supabase reset email link."
      action={
        <>
          <input className="field" type="password" placeholder="New password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <input className="field" type="password" placeholder="Confirm password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          <Button className="w-full" onClick={updatePassword} disabled={loading || !password || !confirmPassword}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : null}
            Update password
          </Button>
          {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
        </>
      }
    />
  );
}

function AuthCard({ title, subtitle, action }: { title: string; subtitle: string; action: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-black text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6 space-y-4">{action}</div>
        <Link href="/login" className="mt-5 inline-flex text-sm font-semibold text-clinic-700">
          Back to login
        </Link>
      </Card>
    </main>
  );
}

export function DashboardView() {
  const store = useDemoStore();
  const pending = store.data.reports.filter((report) => report.status !== "approved").length;
  const approved = store.data.reports.filter((report) => report.status === "approved").length;
  const today = new Date().toISOString().slice(0, 10);
  const todayReports = store.data.reports.filter((report) => report.createdAt.startsWith(today)).length;
  const stats = [
    ["Total patients", store.data.patients.length],
    ["Total scans", store.data.scans.length],
    ["Pending reports", pending],
    ["Approved reports", approved],
    ["Reports today", todayReports]
  ];

  return (
    <>
      <PageTitle
        title="Clinical Dashboard"
        subtitle="A practical front-end demo for the OCT-only MVP. Data is stored in local demo mode until Supabase is connected."
        action={
          <div className="flex gap-2">
            <Link href="/patients/new">
              <Button>
                <Plus size={16} />
                New Patient
              </Button>
            </Link>
            <Link href="/scans/upload">
              <Button variant="secondary">
                <Upload size={16} />
                Upload OCT
              </Button>
            </Link>
          </div>
        }
      />
      <SafetyNotice />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          </Card>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent Patients" subtitle="Open a patient profile to view scans and report history." />
          <div className="divide-y divide-slate-100">
            {store.data.patients.slice(0, 5).map((patient) => (
              <Link key={patient.id} href={`/patients/${patient.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                <div>
                  <p className="font-bold text-slate-900">{patient.fullName}</p>
                  <p className="text-sm text-slate-500">{patient.patientCode}</p>
                </div>
                <p className="text-sm font-semibold text-clinic-700">Open</p>
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Recent Reports" subtitle="Drafts stay clearly separated from approved reports." />
          <ReportRows reports={store.data.reports.slice(0, 5)} />
        </Card>
      </div>
    </>
  );
}

export function NewPatientView() {
  const router = useRouter();
  const store = useDemoStore();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    patientCode: `MCS-OCT-${String(store.data.patients.length + 1).padStart(4, "0")}`,
    fullName: "",
    age: "",
    gender: "Female" as Gender,
    phone: "",
    email: "",
    address: "",
    diabetesHistory: "Unknown" as Patient["diabetesHistory"],
    previousEyeDisease: "",
    clinicalNotes: ""
  });

  const submit = async () => {
    setError("");
    if (!form.patientCode || !form.fullName || !form.age || !form.gender) {
      setError("Please enter patient ID, name, age, and gender.");
      return;
    }
    try {
      const patient = await store.createPatient({ ...form, age: Number(form.age) });
      router.push(`/patients/${patient.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create patient.");
    }
  };

  return (
    <>
      <PageTitle title="New Patient" subtitle="Create a patient record before uploading an OCT image." />
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Patient ID / MR Number" value={form.patientCode} onChange={(value) => setForm({ ...form, patientCode: value })} />
          <Field label="Full name" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} />
          <Field label="Age" type="number" value={form.age} onChange={(value) => setForm({ ...form, age: value })} />
          <SelectField label="Gender" value={form.gender} options={["Female", "Male", "Other"]} onChange={(value) => setForm({ ...form, gender: value as Gender })} />
          <Field label="Phone number" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
          <SelectField
            label="Diabetes history"
            value={form.diabetesHistory}
            options={["Yes", "No", "Unknown"]}
            onChange={(value) => setForm({ ...form, diabetesHistory: value as Patient["diabetesHistory"] })}
          />
          <Field label="Previous eye disease" value={form.previousEyeDisease} onChange={(value) => setForm({ ...form, previousEyeDisease: value })} />
          <Textarea label="Clinical notes" value={form.clinicalNotes} onChange={(value) => setForm({ ...form, clinicalNotes: value })} />
        </div>
        {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
        <div className="mt-5 flex justify-end">
          <Button onClick={submit}>
            <Save size={16} />
            Save Patient
          </Button>
        </div>
      </Card>
    </>
  );
}

export function SearchPatientsView() {
  const store = useDemoStore();
  const [query, setQuery] = useState("");
  const results = store.data.patients.filter((patient) => {
    const value = `${patient.patientCode} ${patient.fullName} ${patient.phone}`.toLowerCase();
    return value.includes(query.toLowerCase());
  });
  return (
    <>
      <PageTitle title="Search Patient" subtitle="Find records by patient ID, name, or phone number." />
      <Card className="p-5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search MCS-OCT-0001, patient name, phone..." />
        </div>
      </Card>
      <Card className="mt-5 overflow-hidden">
        <PatientTable patients={results} scans={store.data.scans} reports={store.data.reports} />
      </Card>
    </>
  );
}

export function PatientProfileView({ id }: { id: string }) {
  const store = useDemoStore();
  const patient = store.data.patients.find((item) => item.id === id);
  if (!patient) return <Missing title="Patient not found" href="/patients/search" label="Back to search" />;
  const scans = store.data.scans.filter((scan) => scan.patientId === patient.id);
  const reports = store.data.reports.filter((report) => report.patientId === patient.id);

  return (
    <>
      <PageTitle
        title={patient.fullName}
        subtitle={`${patient.patientCode} | ${patient.age} years | ${patient.gender}`}
        action={
          <Link href={`/scans/upload?patient=${patient.id}`}>
            <Button>
              <Upload size={16} />
              Upload New OCT Scan
            </Button>
          </Link>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card className="p-5">
          <h3 className="font-black text-slate-950">Patient Information</h3>
          <Info label="Phone" value={patient.phone || "Not provided"} />
          <Info label="Diabetes history" value={patient.diabetesHistory} />
          <Info label="Previous eye disease" value={patient.previousEyeDisease || "None noted"} />
          <Info label="Clinical notes" value={patient.clinicalNotes || "No notes"} />
        </Card>
        <Card>
          <CardHeader title="Uploaded Scans" subtitle="Each scan links to the AI analysis page." />
          {scans.length ? (
            <div className="divide-y divide-slate-100">
              {scans.map((scan) => {
                const ai = store.data.aiResults.find((result) => result.scanId === scan.id);
                const report = store.data.reports.find((item) => item.scanId === scan.id);
                return (
                  <div key={scan.id} className="grid gap-4 px-5 py-4 md:grid-cols-[92px_1fr_auto] md:items-center">
                    <img src={scan.imageUrl} alt="OCT thumbnail" className="h-20 w-24 rounded-md border border-slate-200 object-cover" />
                    <div>
                      <p className="font-bold text-slate-900">{new Date(scan.createdAt).toLocaleString()}</p>
                      <p className="text-sm text-slate-500">Eye side: {scan.eyeSide}</p>
                      <p className="text-sm text-slate-500">
                        AI: {ai ? `${ai.predictedClass} (${Math.round(ai.confidence * 100)}%)` : "Not analyzed"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {report ? <StatusBadge status={report.status} /> : null}
                      <Link href={`/scans/${scan.id}/analysis`}>
                        <Button variant="secondary">Open Analysis</Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState title="No scans yet" body="Upload an OCT scan to start analysis." />
            </div>
          )}
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="Report History" />
        <ReportRows reports={reports} />
      </Card>
    </>
  );
}

export function UploadScanView() {
  const router = useRouter();
  const store = useDemoStore();
  const [patientId, setPatientId] = useState("");
  const [eyeSide, setEyeSide] = useState<EyeSide>("Unknown");
  const [scanNotes, setScanNotes] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [analysisWarning, setAnalysisWarning] = useState("");
  const [loading, setLoading] = useState(false);

  const onFile = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Only JPG, JPEG, and PNG OCT images are supported.");
      return;
    }
    setError("");
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    setError("");
    setAnalysisWarning("");
    if (!patientId || !imageUrl || !selectedFile) {
      setError("Please select a patient and upload an OCT image.");
      return;
    }
    setLoading(true);
    try {
      const prediction = await predictOCT(selectedFile);
      if (!prediction.is_valid_oct) {
        const message =
          prediction.prediction === "INVALID_IMAGE"
            ? "Invalid image uploaded. Please upload a valid OCT scan."
            : "Low-confidence result. AI could not confidently classify this scan. Requires doctor review.";
        setAnalysisWarning(`${message} ${prediction.disclaimer}`);
        return;
      }

      const scan = await store.addScan({ patientId, imageUrl, eyeSide, scanNotes, file: selectedFile });
      const aiResult = await store.saveBackendAnalysis(scan, prediction);
      await store.createReport(scan, aiResult);
      router.push(`/scans/${scan.id}/analysis`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI prediction failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageTitle title="Upload OCT Scan" subtitle="Demo mode stores the image in the browser. Supabase Storage will replace this layer." />
      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Patient"
              value={patientId}
              options={["", ...store.data.patients.map((patient) => patient.id)]}
              optionLabels={{ "": "Select patient", ...Object.fromEntries(store.data.patients.map((patient) => [patient.id, `${patient.patientCode} - ${patient.fullName}`])) }}
              onChange={setPatientId}
            />
            <SelectField label="Eye side" value={eyeSide} options={["Left", "Right", "Both", "Unknown"]} onChange={(value) => setEyeSide(value as EyeSide)} />
          </div>
          <Textarea label="Scan notes" value={scanNotes} onChange={setScanNotes} />
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center hover:border-clinic-300">
            <Upload className="text-clinic-600" size={28} />
            <span className="mt-3 font-bold text-slate-900">Upload OCT image</span>
            <span className="text-sm text-slate-500">JPG, JPEG, or PNG</span>
            <input className="hidden" type="file" accept=".jpg,.jpeg,.png" onChange={(event) => onFile(event.target.files?.[0])} />
          </label>
          {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
          {analysisWarning ? <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{analysisWarning}</p> : null}
          <div className="mt-5 flex justify-end">
            <Button onClick={submit} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
              {loading ? "Analyzing with EfficientNet-B3..." : "Save and Analyze"}
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-black text-slate-950">Image Preview</h3>
          {imageUrl ? (
            <img src={imageUrl} alt="Uploaded OCT preview" className="mt-4 aspect-[4/3] w-full rounded-md border border-slate-200 object-cover" />
          ) : (
            <div className="mt-4">
              <EmptyState title="No image selected" body="The OCT preview appears here before upload." />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export function AnalysisView({ id }: { id: string }) {
  const router = useRouter();
  const store = useDemoStore();
  const scan = store.data.scans.find((item) => item.id === id);
  if (!scan) return <Missing title="Scan not found" href="/dashboard" label="Back to dashboard" />;
  const patient = store.data.patients.find((item) => item.id === scan.patientId);
  const aiResult = store.data.aiResults.find((item) => item.scanId === scan.id);

  const generate = async () => {
    const result = aiResult ?? store.runAnalysis(scan);
    const report = await store.createReport(scan, result);
    router.push(`/reports/${report.id}/edit`);
  };

  return (
    <>
      <PageTitle
        title="AI Analysis"
        subtitle={patient ? `${patient.patientCode} - ${patient.fullName}` : "OCT scan analysis"}
        action={
          <Button onClick={generate}>
            <FileText size={16} />
            Generate Report
          </Button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <Card className="p-5">
          <img src={scan.imageUrl} alt="OCT scan" className="aspect-[4/3] w-full rounded-md bg-slate-900 object-cover" />
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-black text-slate-950">Model Output</h3>
            <StatusBadge status="demo" />
          </div>
          <SafetyNotice />
          {aiResult ? (
            <div className="mt-5 space-y-5">
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-500">AI Prediction</p>
                <p className="mt-1 text-4xl font-black text-clinic-700">{aiResult.predictedClass}</p>
                <p className="mt-1 text-sm text-slate-500">Confidence {Math.round(aiResult.confidence * 100)}%</p>
              </div>
              <div className="space-y-3">
                {diseaseClasses.map((item) => (
                  <Probability key={item} label={item} value={aiResult.probabilities[item]} active={item === aiResult.predictedClass} />
                ))}
              </div>
              <Info label="Model" value={`${aiResult.modelName} ${aiResult.modelVersion}`} />
              <Info label="Timestamp" value={new Date(aiResult.createdAt).toLocaleString()} />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => store.runAnalysis(scan)}>
                  <RotateCcw size={16} />
                  Re-run Analysis
                </Button>
                <Link href={`/patients/${scan.patientId}`}>
                  <Button variant="ghost">Back to Patient</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState title="No result yet" body="Run demo mode if the FastAPI backend is unavailable." />
              <Button className="mt-4" onClick={() => store.runAnalysis(scan)}>
                Run Demo AI
              </Button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export function ReportEditorView({ id }: { id: string }) {
  const router = useRouter();
  const store = useDemoStore();
  const report = store.data.reports.find((item) => item.id === id);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<Report | undefined>(report);

  useEffect(() => {
    if (report) setDraft(report);
  }, [report?.id]);

  if (!store.ready) return <Missing title="Loading report" href="/reports/history" label="Back to history" />;
  if (!report || !draft) return <Missing title="Report not found" href="/reports/history" label="Back to history" />;
  const patient = store.data.patients.find((item) => item.id === draft.patientId);
  const scan = store.data.scans.find((item) => item.id === draft.scanId);
  const ai = store.data.aiResults.find((item) => item.id === draft.aiResultId);

  const save = async (status: Report["status"] = draft.status) => {
    const next = { ...draft, status };
    try {
      await store.saveReport(next);
      setDraft(next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save report.");
    }
  };

  const approve = async () => {
    setError("");
    try {
      const approved = await store.approveReport(draft);
      router.push(`/reports/${approved.id}/view`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve report.");
    }
  };

  return (
    <>
      <PageTitle title="Report Editor" subtitle="Doctors can edit and approve. Assistants can save drafts only." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Card className="p-5">
          {patient ? <Info label="Patient" value={`${patient.patientCode} - ${patient.fullName}`} /> : null}
          {ai ? (
            <>
              <Info label="AI prediction" value={`${ai.predictedClass} (${Math.round(ai.confidence * 100)}%)`} />
              <SafetyNotice />
            </>
          ) : null}
          {scan ? <img src={scan.imageUrl} alt="OCT scan" className="mt-4 aspect-[4/3] w-full rounded-md object-cover" /> : null}
        </Card>
        <Card className="p-5">
          <div className="grid gap-4">
            <Textarea label="Findings" value={draft.findings} onChange={(value) => setDraft({ ...draft, findings: value })} />
            <Textarea label="Impression" value={draft.impression} onChange={(value) => setDraft({ ...draft, impression: value })} />
            <Textarea label="Recommendation" value={draft.recommendation} onChange={(value) => setDraft({ ...draft, recommendation: value })} />
            <Textarea label="Doctor notes" value={draft.doctorNotes} onChange={(value) => setDraft({ ...draft, doctorNotes: value })} />
            <SelectField
              label="Final diagnosis"
              value={draft.finalDiagnosis}
              options={["Needs clinical correlation", ...diseaseClasses]}
              onChange={(value) => setDraft({ ...draft, finalDiagnosis: value as Report["finalDiagnosis"] })}
            />
          </div>
          {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
          {saved ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">Draft saved.</p> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => save("draft")}>
              <Save size={16} />
              Save Draft
            </Button>
            <Button variant="secondary" onClick={() => save("pending_review")}>Needs Review</Button>
            <Button onClick={approve}>
              <CheckCircle2 size={16} />
              Approve Report
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

export function ReportView({ id }: { id: string }) {
  const store = useDemoStore();
  const report = store.data.reports.find((item) => item.id === id);
  if (!report) return <Missing title="Report not found" href="/reports/history" label="Back to history" />;
  const patient = store.data.patients.find((item) => item.id === report.patientId);
  const scan = store.data.scans.find((item) => item.id === report.scanId);
  const ai = store.data.aiResults.find((item) => item.id === report.aiResultId);
  const approver = store.data.profiles.find((item) => item.id === report.approvedBy);

  return (
    <>
      <PageTitle
        title="Report View"
        subtitle={patient ? `${patient.patientCode} - ${patient.fullName}` : "Approved report"}
        action={
          patient && scan && ai ? (
            <Button onClick={() => downloadReportPdf({ patient, scan, aiResult: ai, report, approver })}>
              <Download size={16} />
              Download PDF
            </Button>
          ) : null
        }
      />
      <Card className="p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-950">AI-Assisted OCT Report</h3>
            <p className="mt-1 text-sm text-slate-500">Final status depends on doctor/admin approval.</p>
          </div>
          <StatusBadge status={report.status} />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[320px_1fr]">
          <div>
            {scan ? <img src={scan.imageUrl} alt="OCT scan" className="aspect-[4/3] w-full rounded-md object-cover" /> : null}
            <div className="mt-4 space-y-3">
              {patient ? <Info label="Patient" value={`${patient.patientCode} - ${patient.fullName}`} /> : null}
              {ai ? <Info label="AI prediction" value={`${ai.predictedClass} (${Math.round(ai.confidence * 100)}%)`} /> : null}
              <Info label="Approved by" value={approver?.fullName ?? "Not approved"} />
              <Info label="Approved at" value={report.approvedAt ? new Date(report.approvedAt).toLocaleString() : "Not approved"} />
            </div>
          </div>
          <div className="space-y-5">
            <SafetyNotice />
            <ReportSection title="Findings" body={report.findings} />
            <ReportSection title="Impression" body={report.impression} />
            <ReportSection title="Recommendation" body={report.recommendation} />
            <ReportSection title="Doctor Notes" body={report.doctorNotes || "No additional notes."} />
            <ReportSection title="Final Diagnosis" body={report.finalDiagnosis} />
          </div>
        </div>
      </Card>
    </>
  );
}

export function ReportHistoryView() {
  const store = useDemoStore();
  const [query, setQuery] = useState("");
  const reports = store.data.reports.filter((report) => {
    const patient = store.data.patients.find((item) => item.id === report.patientId);
    const ai = store.data.aiResults.find((item) => item.id === report.aiResultId);
    return `${patient?.patientCode} ${patient?.fullName} ${report.status} ${ai?.predictedClass} ${report.finalDiagnosis}`
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  return (
    <>
      <PageTitle title="Report History" subtitle="Search by patient ID, name, status, AI prediction, or final diagnosis." />
      <Card className="p-5">
        <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search report history..." />
      </Card>
      <Card className="mt-5">
        <ReportRows reports={reports} />
      </Card>
    </>
  );
}

export function AdminUsersView() {
  const store = useDemoStore();
  return (
    <>
      <PageTitle title="Admin Users" subtitle="Demo role management view. Real edits will update the profiles table." />
      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Doctor ID</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {store.data.profiles.map((profile) => (
              <tr key={profile.id}>
                <td className="px-5 py-4 font-bold">{profile.fullName}</td>
                <td className="px-5 py-4">{profile.email}</td>
                <td className="px-5 py-4 capitalize">{profile.role}</td>
                <td className="px-5 py-4">{profile.doctorId ?? "-"}</td>
                <td className="px-5 py-4"><StatusBadge status="active" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

export function TemplatesView() {
  return (
    <>
      <PageTitle title="Report Templates" subtitle="Disease-specific report text used when generating drafts." />
      <div className="grid gap-5 lg:grid-cols-2">
        {diseaseClasses.map((item) => (
          <Card key={item} className="p-5">
            <h3 className="text-lg font-black text-slate-950">{item}</h3>
            <ReportSection title="Findings" body={reportTemplates[item].findings} />
            <ReportSection title="Impression" body={reportTemplates[item].impression} />
            <ReportSection title="Recommendation" body={reportTemplates[item].recommendation} />
          </Card>
        ))}
      </div>
    </>
  );
}

export function AuditLogsView() {
  const store = useDemoStore();
  return (
    <>
      <PageTitle title="Audit Logs" subtitle="Tracks clinical workflow actions for accountability." />
      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Record</th>
              <th className="px-5 py-3">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {store.data.auditLogs.map((log) => {
              const user = store.data.profiles.find((profile) => profile.id === log.userId);
              return (
                <tr key={log.id}>
                  <td className="px-5 py-4 font-bold">{log.action}</td>
                  <td className="px-5 py-4">{user?.fullName ?? "Unknown"}</td>
                  <td className="px-5 py-4">{log.recordType}</td>
                  <td className="px-5 py-4">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function ReportRows({ reports }: { reports: Report[] }) {
  const store = useDemoStore();
  if (!reports.length) return <div className="p-5"><EmptyState title="No reports" body="Generated reports will appear here." /></div>;
  return (
    <div className="divide-y divide-slate-100">
      {reports.map((report) => {
        const patient = store.data.patients.find((item) => item.id === report.patientId);
        const ai = store.data.aiResults.find((item) => item.id === report.aiResultId);
        return (
          <div key={report.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
            <div>
              <p className="font-bold text-slate-900">{patient?.fullName ?? "Unknown patient"}</p>
              <p className="text-sm text-slate-500">{patient?.patientCode} | AI: {ai?.predictedClass ?? "-"}</p>
            </div>
            <StatusBadge status={report.status} />
            <div className="flex gap-2">
              <Link href={`/reports/${report.id}/edit`}>
                <Button variant="secondary">Edit</Button>
              </Link>
              <Link href={`/reports/${report.id}/view`}>
                <Button variant="secondary">View</Button>
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PatientTable({ patients, scans, reports }: { patients: Patient[]; scans: { patientId: string; createdAt: string }[]; reports: Report[] }) {
  if (!patients.length) return <div className="p-5"><EmptyState title="No patients found" body="Try a different patient ID or name." /></div>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
        <tr>
          <th className="px-5 py-3">Patient ID</th>
          <th className="px-5 py-3">Name</th>
          <th className="px-5 py-3">Age/Gender</th>
          <th className="px-5 py-3">Last scan</th>
          <th className="px-5 py-3">Reports</th>
          <th className="px-5 py-3">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {patients.map((patient) => {
          const patientScans = scans.filter((scan) => scan.patientId === patient.id);
          return (
            <tr key={patient.id}>
              <td className="px-5 py-4 font-bold">{patient.patientCode}</td>
              <td className="px-5 py-4">{patient.fullName}</td>
              <td className="px-5 py-4">{patient.age} / {patient.gender}</td>
              <td className="px-5 py-4">{patientScans[0] ? new Date(patientScans[0].createdAt).toLocaleDateString() : "-"}</td>
              <td className="px-5 py-4">{reports.filter((report) => report.patientId === patient.id).length}</td>
              <td className="px-5 py-4">
                <Link href={`/patients/${patient.id}`}>
                  <Button variant="secondary">Open</Button>
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field mt-1" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  optionLabels,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="field mt-1" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block md:col-span-2">
      <span className="label">{label}</span>
      <textarea className="field mt-1 min-h-24 resize-y" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Probability({ label, value, active }: { label: string; value: number; active: boolean }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-bold text-slate-700">{label}</span>
        <span className="font-semibold text-slate-500">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={active ? "h-2 rounded-full bg-clinic-600" : "h-2 rounded-full bg-slate-300"} style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
    </div>
  );
}

function ReportSection({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-4">
      <h4 className="text-sm font-black uppercase tracking-wide text-slate-500">{title}</h4>
      <p className="mt-2 leading-7 text-slate-800">{body}</p>
    </section>
  );
}

function Missing({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <Card className="p-6">
      <EmptyState title={title} body="The selected record could not be found in demo storage." />
      <Link href={href} className="mt-4 inline-flex">
        <Button variant="secondary">{label}</Button>
      </Link>
    </Card>
  );
}
