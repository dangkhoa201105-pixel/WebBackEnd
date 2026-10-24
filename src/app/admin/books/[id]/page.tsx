import BookForm from "../book-form";
export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) { return <BookForm id={(await params).id} />; }
