import type { ExerciseSeed } from "../types.js";

export default [
  {
    title: "Book model",
    brief: "Write a Django model called Book with a title, an author, a publish date and a price.",
    steps: [
      "class Book(models.Model) with title and author as CharField(max_length=...)",
      "published as a DateField and price as a DecimalField with max_digits and decimal_places",
      "A __str__ method that returns self.title",
    ],
    level: "basic",
    editor: "python",
    starter: `from django.db import models


class Book(models.Model):
    # Add title, author, published and price fields here
    pass
`,
    solution: `from django.db import models


class Book(models.Model):
    title = models.CharField(max_length=200)
    author = models.CharField(max_length=100)
    published = models.DateField()
    price = models.DecimalField(max_digits=8, decimal_places=2)

    def __str__(self):
        return self.title
`,
    check: {
      rules: [
        { match: String.raw`class\s+Book\s*\(\s*models\.Model\s*\)\s*:`, message: "A Book class that extends models.Model" },
        { match: String.raw`title\s*=\s*models\.CharField\s*\([^)]*max_length\s*=\s*\d+`, message: "title is a CharField with max_length" },
        { match: String.raw`author\s*=\s*models\.CharField\s*\([^)]*max_length\s*=\s*\d+`, message: "author is a CharField with max_length" },
        { match: String.raw`published\s*=\s*models\.DateField\s*\(`, message: "published is a DateField" },
        { match: String.raw`price\s*=\s*models\.DecimalField\s*\((?=[^)]*max_digits\s*=)(?=[^)]*decimal_places\s*=)`, message: "price is a DecimalField with max_digits and decimal_places" },
        { match: String.raw`def\s+__str__\s*\(\s*self\s*\)[^:]*:\s*return\s+(str\s*\(\s*)?self\.title`, message: "__str__ returns the title" },
      ],
    },
  },
  {
    title: "Hello view and URL",
    brief: "Write two function views, home and about, and connect them to URLs with path().",
    steps: [
      "def home(request) returns HttpResponse(\"Welcome to the library\")",
      "def about(request) returns an HttpResponse with any text",
      "urlpatterns has path(\"\", home, name=\"home\") and path(\"about/\", about, name=\"about\")",
    ],
    level: "basic",
    editor: "python",
    starter: `from django.http import HttpResponse
from django.urls import path


def home(request):
    pass


# Write the about view here


urlpatterns = [
    # Add the two paths here
]
`,
    solution: `from django.http import HttpResponse
from django.urls import path


def home(request):
    return HttpResponse("Welcome to the library")


def about(request):
    return HttpResponse("We lend books to everyone.")


urlpatterns = [
    path("", home, name="home"),
    path("about/", about, name="about"),
]
`,
    check: {
      rules: [
        { match: String.raw`def\s+home\s*\(\s*request\s*\)\s*:\s*return\s+HttpResponse\s*\(\s*["']Welcome to the library["']\s*\)`, message: "home returns HttpResponse(\"Welcome to the library\")" },
        { match: String.raw`def\s+about\s*\(\s*request\s*\)\s*:\s*return\s+HttpResponse\s*\(`, message: "about returns an HttpResponse" },
        { match: String.raw`path\s*\(\s*["']["']\s*,\s*(views\.)?home\s*,\s*name\s*=\s*["']home["']\s*\)`, message: "path(\"\", home, name=\"home\")" },
        { match: String.raw`path\s*\(\s*["']about/["']\s*,\s*(views\.)?about\s*,\s*name\s*=\s*["']about["']\s*\)`, message: "path(\"about/\", about, name=\"about\")" },
      ],
    },
  },
  {
    title: "Admin with list display",
    brief: "Register the Book model in the Django admin with a BookAdmin class that shows useful columns, a search box and a filter.",
    steps: [
      "Register Book with @admin.register(Book) or admin.site.register(Book, BookAdmin)",
      "class BookAdmin(admin.ModelAdmin)",
      "list_display includes \"title\", \"author\" and \"price\"; search_fields includes \"title\"",
      "list_filter includes \"published\"",
    ],
    level: "basic",
    editor: "python",
    starter: `from django.contrib import admin

from .models import Book

# Register Book with a BookAdmin class here
`,
    solution: `from django.contrib import admin

from .models import Book


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "price")
    search_fields = ("title", "author")
    list_filter = ("published",)
`,
    check: {
      rules: [
        { match: String.raw`@admin\.register\s*\(\s*Book\s*\)|admin\.site\.register\s*\(\s*Book\s*,\s*BookAdmin\s*\)`, message: "Book is registered with BookAdmin" },
        { match: String.raw`class\s+BookAdmin\s*\(\s*admin\.ModelAdmin\s*\)\s*:`, message: "A BookAdmin class that extends admin.ModelAdmin" },
        { match: String.raw`list_display\s*=\s*[\[(](?=[^\])]*["']title["'])(?=[^\])]*["']author["'])(?=[^\])]*["']price["'])`, message: "list_display shows title, author and price" },
        { match: String.raw`search_fields\s*=\s*[\[(][^\])]*["']title["']`, message: "search_fields includes title" },
        { match: String.raw`list_filter\s*=\s*[\[(][^\])]*["']published["']`, message: "list_filter includes published" },
      ],
    },
  },
  {
    title: "Book list view",
    brief: "Write a view that loads every book sorted by title and renders them with a template.",
    steps: [
      "def book_list(request)",
      "Get the books with Book.objects.all().order_by(\"title\") (or Book.objects.order_by(\"title\"))",
      "return render(request, \"books/book_list.html\", {\"books\": books})",
    ],
    level: "basic",
    editor: "python",
    starter: `from django.shortcuts import render

from .models import Book


def book_list(request):
    # Load the books and render the template
    pass
`,
    solution: `from django.shortcuts import render

from .models import Book


def book_list(request):
    books = Book.objects.all().order_by("title")
    return render(request, "books/book_list.html", {"books": books})
`,
    check: {
      rules: [
        { match: String.raw`def\s+book_list\s*\(\s*request\s*\)\s*:`, message: "A book_list(request) view" },
        { match: String.raw`Book\.objects(\.all\s*\(\s*\))?\.order_by\s*\(\s*["']title["']\s*\)`, message: "Books are loaded sorted by title" },
        { match: String.raw`return\s+render\s*\(\s*request\s*,\s*["']books/book_list\.html["']`, message: "Renders books/book_list.html" },
        { match: String.raw`\{\s*["']books["']\s*:\s*\w+\s*\}`, message: "Passes the books to the template as \"books\"" },
      ],
    },
  },
  {
    title: "ORM filter queries",
    brief: "Fill in four Django ORM queries on the Book model, one per variable.",
    steps: [
      "by_narayan: books whose author is exactly \"R.K. Narayan\" (use filter)",
      "cheap_books: books with price less than 300 (price__lt)",
      "newest_first: all books ordered by published, newest first",
      "python_count: the number of books whose title contains \"python\" in any case (title__icontains + count())",
    ],
    level: "intermediate",
    editor: "python",
    starter: `from .models import Book

# 1. Books by "R.K. Narayan"
by_narayan = None

# 2. Books cheaper than 300
cheap_books = None

# 3. All books, newest published first
newest_first = None

# 4. How many titles contain "python" (any case)
python_count = None
`,
    solution: `from .models import Book

by_narayan = Book.objects.filter(author="R.K. Narayan")

cheap_books = Book.objects.filter(price__lt=300)

newest_first = Book.objects.order_by("-published")

python_count = Book.objects.filter(title__icontains="python").count()
`,
    check: {
      rules: [
        { match: String.raw`by_narayan\s*=\s*Book\.objects\.filter\s*\(\s*author\s*=\s*["']R\.K\. Narayan["']\s*\)`, message: "by_narayan filters by author \"R.K. Narayan\"" },
        { match: String.raw`cheap_books\s*=\s*Book\.objects\.filter\s*\(\s*price__lt\s*=\s*300\s*\)`, message: "cheap_books uses price__lt=300" },
        { match: String.raw`newest_first\s*=\s*Book\.objects(\.all\s*\(\s*\))?\.order_by\s*\(\s*["']-published["']\s*\)`, message: "newest_first orders by -published" },
        { match: String.raw`python_count\s*=\s*Book\.objects\.filter\s*\(\s*title__icontains\s*=\s*["']python["']\s*\)\.count\s*\(\s*\)`, message: "python_count uses title__icontains and count()" },
      ],
    },
  },
  {
    title: "Template loop over books",
    brief: "Write a Django template that lists every book with a link to its detail page, and a message when there are no books.",
    steps: [
      "Loop with {% for book in books %} ... {% endfor %}",
      "Show {{ book.title }} inside a link whose href is {% url 'book_detail' book.pk %}",
      "Use {% empty %} to show \"No books yet.\" when the list is empty",
      "Put each book in an li inside a ul",
    ],
    level: "intermediate",
    editor: "html",
    starter: `<h1>Books</h1>
<ul>
  <!-- Loop over the books here -->
</ul>
`,
    solution: `<h1>Books</h1>
<ul>
  {% for book in books %}
    <li><a href="{% url 'book_detail' book.pk %}">{{ book.title }}</a> by {{ book.author }}</li>
  {% empty %}
    <li>No books yet.</li>
  {% endfor %}
</ul>
`,
    check: {
      rules: [
        { match: String.raw`\{%\s*for\s+book\s+in\s+books\s*%\}`, message: "Loops with {% for book in books %}" },
        { match: String.raw`\{\{\s*book\.title\s*\}\}`, message: "Shows {{ book.title }}" },
        { match: String.raw`href\s*=\s*["']\{%\s*url\s+["']book_detail["']\s+book\.(pk|id)\s*%\}["']`, message: "Links to {% url 'book_detail' book.pk %}" },
        { match: String.raw`\{%\s*empty\s*%\}[\s\S]*No books yet`, message: "{% empty %} shows \"No books yet.\"" },
        { match: String.raw`\{%\s*endfor\s*%\}`, message: "The loop is closed with {% endfor %}" },
        { html: "ul li", message: "Books are li items inside a ul" },
      ],
    },
  },
  {
    title: "ModelForm with validation",
    brief: "Create a BookForm ModelForm for the Book model that rejects a price of zero or less.",
    steps: [
      "class BookForm(forms.ModelForm) with class Meta: model = Book",
      "fields = [\"title\", \"author\", \"price\"]",
      "def clean_price(self) raises forms.ValidationError when the price is 0 or less",
      "clean_price returns the price when it is valid",
    ],
    level: "intermediate",
    editor: "python",
    starter: `from django import forms

from .models import Book


class BookForm(forms.ModelForm):
    class Meta:
        pass
`,
    solution: `from django import forms

from .models import Book


class BookForm(forms.ModelForm):
    class Meta:
        model = Book
        fields = ["title", "author", "price"]

    def clean_price(self):
        price = self.cleaned_data["price"]
        if price <= 0:
            raise forms.ValidationError("Price must be more than zero.")
        return price
`,
    check: {
      rules: [
        { match: String.raw`class\s+BookForm\s*\(\s*forms\.ModelForm\s*\)\s*:`, message: "BookForm extends forms.ModelForm" },
        { match: String.raw`class\s+Meta\s*:[\s\S]*model\s*=\s*Book\b`, message: "Meta sets model = Book" },
        { match: String.raw`fields\s*=\s*[\[(](?=[^\])]*["']title["'])(?=[^\])]*["']author["'])(?=[^\])]*["']price["'])`, message: "fields lists title, author and price" },
        { match: String.raw`def\s+clean_price\s*\(\s*self\s*\)\s*:[\s\S]*<=?\s*0[\s\S]*raise\s+(forms\.)?ValidationError\s*\(`, message: "clean_price raises ValidationError for a price of 0 or less" },
        { match: String.raw`def\s+clean_price\s*\(\s*self\s*\)\s*:[\s\S]*\n\s+return\s+\w+`, message: "clean_price returns the value" },
      ],
    },
  },
  {
    title: "Detail view with 404",
    brief: "Write a book_detail view that shows one book or a 404 page, and its URL with an integer primary key.",
    steps: [
      "def book_detail(request, pk)",
      "book = get_object_or_404(Book, pk=pk)",
      "return render(request, \"books/book_detail.html\", {\"book\": book})",
      "urlpatterns has path(\"books/<int:pk>/\", book_detail, name=\"book_detail\")",
    ],
    level: "intermediate",
    editor: "python",
    starter: `from django.shortcuts import get_object_or_404, render
from django.urls import path

from .models import Book


def book_detail(request, pk):
    book = Book.objects.get(pk=pk)
    # Use get_object_or_404 and render the template


urlpatterns = [
]
`,
    solution: `from django.shortcuts import get_object_or_404, render
from django.urls import path

from .models import Book


def book_detail(request, pk):
    book = get_object_or_404(Book, pk=pk)
    return render(request, "books/book_detail.html", {"book": book})


urlpatterns = [
    path("books/<int:pk>/", book_detail, name="book_detail"),
]
`,
    check: {
      rules: [
        { match: String.raw`def\s+book_detail\s*\(\s*request\s*,\s*pk\s*\)\s*:`, message: "A book_detail(request, pk) view" },
        { match: String.raw`get_object_or_404\s*\(\s*Book\s*,\s*(pk|id)\s*=\s*pk\s*\)`, message: "Uses get_object_or_404(Book, pk=pk)" },
        { match: String.raw`render\s*\(\s*request\s*,\s*["']books/book_detail\.html["']\s*,\s*\{\s*["']book["']\s*:\s*book\s*\}`, message: "Renders books/book_detail.html with the book" },
        { match: String.raw`path\s*\(\s*["']books/<int:pk>/["']\s*,\s*(views\.)?book_detail\s*,\s*name\s*=\s*["']book_detail["']\s*\)`, message: "path(\"books/<int:pk>/\", book_detail, name=\"book_detail\")" },
      ],
    },
  },
  {
    title: "Book serializer with DRF",
    brief: "Write a Django REST Framework ModelSerializer for Book that makes id read-only and rejects short titles.",
    steps: [
      "class BookSerializer(serializers.ModelSerializer) with Meta: model = Book",
      "fields = [\"id\", \"title\", \"author\", \"price\"] and read_only_fields = [\"id\"]",
      "def validate_title(self, value) raises serializers.ValidationError when the title is shorter than 3 characters",
      "validate_title returns the value when it is fine",
    ],
    level: "advanced",
    editor: "python",
    starter: `from rest_framework import serializers

from .models import Book


class BookSerializer(serializers.Serializer):
    pass
`,
    solution: `from rest_framework import serializers

from .models import Book


class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "title", "author", "price"]
        read_only_fields = ["id"]

    def validate_title(self, value):
        if len(value.strip()) < 3:
            raise serializers.ValidationError("Title must have at least 3 characters.")
        return value
`,
    check: {
      rules: [
        { match: String.raw`class\s+BookSerializer\s*\(\s*serializers\.ModelSerializer\s*\)\s*:`, message: "BookSerializer extends serializers.ModelSerializer" },
        { match: String.raw`class\s+Meta\s*:[\s\S]*model\s*=\s*Book\b`, message: "Meta sets model = Book" },
        { match: String.raw`\bfields\s*=\s*[\[(](?=[^\])]*["']id["'])(?=[^\])]*["']title["'])(?=[^\])]*["']author["'])(?=[^\])]*["']price["'])`, message: "fields lists id, title, author and price" },
        { match: String.raw`read_only_fields\s*=\s*[\[(][^\])]*["']id["']`, message: "id is in read_only_fields" },
        { match: String.raw`def\s+validate_title\s*\(\s*self\s*,\s*\w+\s*\)\s*:[\s\S]*<\s*3[\s\S]*raise\s+serializers\.ValidationError\s*\(`, message: "validate_title raises serializers.ValidationError for titles under 3 characters" },
        { match: String.raw`def\s+validate_title[\s\S]*\n\s+return\s+\w+`, message: "validate_title returns the value" },
      ],
    },
  },
  {
    title: "Authors with related books",
    brief: "Link books to an Author model with a foreign key, then write two query helpers: author book counts and books with their authors.",
    steps: [
      "Book.author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name=\"books\")",
      "authors_with_counts() returns Author.objects.annotate(book_count=Count(\"books\")) ordered by \"-book_count\"",
      "books_with_authors() returns Book.objects.select_related(\"author\") so each book's author is loaded in the same query",
    ],
    level: "advanced",
    editor: "python",
    starter: `from django.db import models
from django.db.models import Count


class Author(models.Model):
    name = models.CharField(max_length=100)


class Book(models.Model):
    title = models.CharField(max_length=200)
    # Link each book to an Author here


def authors_with_counts():
    return None


def books_with_authors():
    return None
`,
    solution: `from django.db import models
from django.db.models import Count


class Author(models.Model):
    name = models.CharField(max_length=100)


class Book(models.Model):
    title = models.CharField(max_length=200)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")


def authors_with_counts():
    return Author.objects.annotate(book_count=Count("books")).order_by("-book_count")


def books_with_authors():
    return Book.objects.select_related("author")
`,
    check: {
      rules: [
        { match: String.raw`author\s*=\s*models\.ForeignKey\s*\(\s*["']?Author["']?\s*,(?=[^)]*on_delete\s*=\s*models\.CASCADE)(?=[^)]*related_name\s*=\s*["']books["'])`, message: "Book.author is a ForeignKey to Author with on_delete=CASCADE and related_name=\"books\"" },
        { match: String.raw`Author\.objects(\.all\s*\(\s*\))?\.annotate\s*\(\s*book_count\s*=\s*(models\.)?Count\s*\(\s*["']books["']\s*\)\s*\)`, message: "Annotates authors with book_count=Count(\"books\")" },
        { match: String.raw`\.order_by\s*\(\s*["']-book_count["']\s*\)`, message: "Orders authors by -book_count" },
        { match: String.raw`Book\.objects(\.all\s*\(\s*\))?\.select_related\s*\(\s*["']author["']\s*\)`, message: "Uses select_related(\"author\") for books" },
      ],
    },
  },
] satisfies ExerciseSeed[];
