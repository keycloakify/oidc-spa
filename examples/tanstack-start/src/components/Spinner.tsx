import { Loader2 } from "lucide-react";

type SpinnerProps = {
    className?: string;
};

export default function Spinner(props: SpinnerProps) {
    const { className } = props;

    const classes = ["h-8 w-8 animate-spin text-white/80", className].filter(Boolean).join(" ");

    return <Loader2 className={classes} />;
}
