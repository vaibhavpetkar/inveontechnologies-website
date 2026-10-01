import type { PracticeUnit } from "../../types.js";
import { cppq, has } from "./shared.js";

const classNamed = (name: string) => has(String.raw`\b(class|struct)\s+${name}\b`, `Defines a class named ${name}`);
const privateData = has(String.raw`\bprivate\s*:`, "Keeps the data members private");
const virtualFn = has(String.raw`\bvirtual\b`, "Uses a virtual function");
const overrides = has(String.raw`\boverride\b`, "Marks the derived versions with override");

export const oop: PracticeUnit = {
  key: "oop",
  title: "Classes, inheritance and polymorphism",
  summary: "classes and objects, constructors and destructors, const members, static members, operator overloading, inheritance, virtual functions, abstract classes and smart pointers",
  reading: String.raw`## Classes and objects

A class bundles data (members) with the functions that work on it (methods). An object is one variable of that class type.

` + "```cpp" + String.raw`
class Rectangle {
private:
    double length = 0, width = 0;       // data is hidden
public:
    Rectangle(double l, double w) : length(l), width(w) {}   // constructor
    double area() const { return length * width; }
};

Rectangle r(4, 5);
cout << r.area();                        // 20
` + "```" + String.raw`

- private members can only be used inside the class; public ones form its interface. Keeping data private (encapsulation) lets the class guarantee its rules, like "the balance never goes below zero".
- In a class, members are private by default; in a struct they are public.
- The constructor has the class name and no return type. The part after the colon is the member initializer list: it initialises members directly and is the preferred style.
- A method marked const promises not to change the object, so it can be called on const objects and const references.
- Inside a method, this points to the current object. You need it mainly when a parameter has the same name as a member: this->name = name;

## Destructors and object lifetime

A destructor (~Rectangle()) runs automatically when the object dies: at the end of its block for a local, or when delete is called. Local objects die in reverse order of creation. This rule is called RAII: acquire a resource in the constructor, release it in the destructor, and you never forget to clean up. string, vector and fstream all work this way.

## Static members

A static data member belongs to the class, not to each object: one shared counter for all objects. Declare it inside the class and define it once outside: int Visitor::count = 0; (or write inline static int count = 0; in C++17). A static method is called on the class: Visitor::total().

## Operator overloading

You can give operators a meaning for your own types:

` + "```cpp" + String.raw`
Complex operator+(const Complex& other) const {
    return Complex(re + other.re, im + other.im);
}
friend ostream& operator<<(ostream& out, const Complex& c) { ... }
` + "```" + String.raw`

Overload only when the meaning is obvious (maths types, printing, comparing).

## Inheritance

A derived class reuses and extends a base class:

` + "```cpp" + String.raw`
class Person {
protected:
    string name;
public:
    Person(const string& n) : name(n) {}
};

class Student : public Person {
    int roll = 0;
public:
    Student(const string& n, int r) : Person(n), roll(r) {}
};
` + "```" + String.raw`

- protected members are visible to derived classes but not to the outside world.
- The base part is built first: its constructor runs before the derived one, and destructors run in the opposite order.
- Call the base constructor in the initializer list; call a base version of a method with Person::introduce().

## Polymorphism with virtual functions

When a base class pointer or reference refers to a derived object, a virtual function call runs the derived version, decided at run time:

` + "```cpp" + String.raw`
class Shape {
public:
    virtual double area() const = 0;   // pure virtual: Shape is abstract
    virtual ~Shape() = default;
};
class Circle : public Shape {
    double r = 0;
public:
    explicit Circle(double radius) : r(radius) {}
    double area() const override { return 3.14159265358979 * r * r; }
};

vector<unique_ptr<Shape>> shapes;
shapes.push_back(make_unique<Circle>(2));
for (const auto& s : shapes) cout << s->area() << "\n";
` + "```" + String.raw`

- A class with a pure virtual function (= 0) is abstract: you can't create one, only derived classes that implement it.
- override makes the compiler check that you really override a base function (a typo in the name or a missing const becomes an error instead of a silent new function).
- Give a polymorphic base class a virtual destructor, otherwise deleting a derived object through a base pointer skips the derived destructor.
- Store polymorphic objects by pointer. unique_ptr (from memory) deletes the object for you; avoid raw new and delete. Storing Shape by value would slice off the derived part.

## How your assignments are checked

Each question names the classes and methods to write, and the checker looks for them (class names, private data, virtual, override, public inheritance). Then your program is compiled and run on the example and hidden inputs, so main must still read the input and print the results.`,
  questions: [
    cppq("Rectangle class", "Write a class Rectangle with private length and width, a constructor, and const methods area(), perimeter() and isSquare(). Read the sides and print the results.", ["Input: length and width (integers)", "Output: area, perimeter, then Square or Not a square"], String.raw`#include <iostream>
using namespace std;

class Rectangle {
private:
    long long length = 0, width = 0;

public:
    Rectangle(long long l, long long w) : length(l), width(w) {}
    long long area() const { return length * width; }
    long long perimeter() const { return 2 * (length + width); }
    bool isSquare() const { return length == width; }
};

int main() {
    long long l, w;
    cin >> l >> w;
    Rectangle r(l, w);
    cout << "Area: " << r.area() << "\n";
    cout << "Perimeter: " << r.perimeter() << "\n";
    cout << (r.isSquare() ? "Square" : "Not a square") << "\n";
    return 0;
}
`, [["4 5", "20 18 Not a square"], ["3 3", "9 12 Square", ["not"]]], [["1 100", "100 202 Not a square"], ["7 7", "49 28 Square", ["not"]]], { rules: [classNamed("Rectangle"), privateData, has(String.raw`\barea\s*\(\s*\)\s*const\b`, "area() is a const method")] }),

    cppq("Bank account", "Write a class BankAccount with a private balance, deposit(amount) and a withdraw(amount) that returns false (and changes nothing) when the balance is too low. Process a list of transactions.", ["Input line 1: the owner's name and opening balance", "Input line 2: q, the number of transactions", "Next q lines: D <amount> or W <amount>", "Output per transaction: Deposited <amount>. Balance: <b>, Withdrew <amount>. Balance: <b>, or Insufficient balance", "Last line: Final balance for <name>: <b>"], String.raw`#include <iostream>
#include <string>
using namespace std;

class BankAccount {
private:
    string owner;
    long long balance = 0;

public:
    BankAccount(const string& name, long long opening) : owner(name), balance(opening) {}

    void deposit(long long amount) { balance += amount; }

    bool withdraw(long long amount) {
        if (amount > balance) return false;
        balance -= amount;
        return true;
    }

    long long getBalance() const { return balance; }
    const string& getOwner() const { return owner; }
};

int main() {
    string name;
    long long opening;
    int q;
    cin >> name >> opening >> q;
    BankAccount account(name, opening);
    for (int i = 0; i < q; i++) {
        char type;
        long long amount;
        cin >> type >> amount;
        if (type == 'D') {
            account.deposit(amount);
            cout << "Deposited " << amount << ". Balance: " << account.getBalance() << "\n";
        } else if (account.withdraw(amount)) {
            cout << "Withdrew " << amount << ". Balance: " << account.getBalance() << "\n";
        } else {
            cout << "Insufficient balance\n";
        }
    }
    cout << "Final balance for " << account.getOwner() << ": " << account.getBalance() << "\n";
    return 0;
}
`, [["Ravi 1000\n3\nD 500\nW 200\nW 5000", "Deposited 500 Balance 1500 Withdrew 200 Balance 1300 Insufficient balance Final balance for Ravi 1300"]], [["Asha 0\n2\nW 1\nD 1", "Insufficient balance Deposited 1 Balance 1 Final balance for Asha 1"], ["Om 500\n1\nW 500", "Withdrew 500 Balance 0 Final balance for Om 0"]], { level: "intermediate", rules: [classNamed("BankAccount"), privateData, has(String.raw`\bbool\s+withdraw\s*\(`, "withdraw returns bool")] }),

    cppq("Student records and topper", "Write a class Student with a name and three marks, a constructor, and const methods total() and average(). Read n students into a vector<Student>, print each one's total and average, and the topper (the first one with the highest total).", ["Input: n, then n lines: name mark1 mark2 mark3", "Output per student: name, total, average with 2 decimals", "Last line: Topper: <name>"], String.raw`#include <iostream>
#include <iomanip>
#include <string>
#include <vector>
using namespace std;

class Student {
private:
    string name;
    int m1 = 0, m2 = 0, m3 = 0;

public:
    Student(const string& n, int a, int b, int c) : name(n), m1(a), m2(b), m3(c) {}
    const string& getName() const { return name; }
    int total() const { return m1 + m2 + m3; }
    double average() const { return total() / 3.0; }
};

int main() {
    int n;
    cin >> n;
    vector<Student> students;
    for (int i = 0; i < n; i++) {
        string name;
        int a, b, c;
        cin >> name >> a >> b >> c;
        students.emplace_back(name, a, b, c);
    }
    cout << fixed << setprecision(2);
    size_t best = 0;
    for (size_t i = 0; i < students.size(); i++) {
        const Student& s = students[i];
        cout << s.getName() << " " << s.total() << " " << s.average() << "\n";
        if (s.total() > students[best].total()) best = i;
    }
    cout << "Topper: " << students[best].getName() << "\n";
    return 0;
}
`, [["3\nAsha 78 85 90\nRavi 90 91 92\nMeena 60 70 80", "Asha 253 84.33 Ravi 273 91.00 Meena 210 70.00 Topper Ravi"]], [["1\nOm 0 0 1", "Om 1 0.33 Topper Om"], ["2\nA 50 50 50\nB 60 45 45", "A 150 50.00 B 150 50.00 Topper A"]], { level: "intermediate", rules: [classNamed("Student"), has(String.raw`\bvector\s*<\s*Student\s*>`, "Keeps the students in a vector<Student>"), has(String.raw`\btotal\s*\(\s*\)\s*const\b`, "total() is a const method")] }),

    cppq("Complex numbers with operators", "Write a class Complex (integer real and imaginary parts) that overloads + and * and prints itself with operator<< as a+bi or a-bi. Read two complex numbers and print their sum and product.", ["Input: four integers a b c d, meaning a+bi and c+di", "Output: only two lines, the sum and the product, e.g. 4+6i and -5+10i", "Print a negative imaginary part as 5-1i (no + before the minus)"], String.raw`#include <iostream>
#include <cstdlib>
using namespace std;

class Complex {
private:
    long long re = 0, im = 0;

public:
    Complex(long long r, long long i) : re(r), im(i) {}

    Complex operator+(const Complex& other) const {
        return Complex(re + other.re, im + other.im);
    }

    Complex operator*(const Complex& other) const {
        return Complex(re * other.re - im * other.im, re * other.im + im * other.re);
    }

    friend ostream& operator<<(ostream& out, const Complex& c) {
        out << c.re << (c.im < 0 ? "-" : "+") << llabs(c.im) << "i";
        return out;
    }
};

int main() {
    long long a, b, c, d;
    cin >> a >> b >> c >> d;
    Complex x(a, b), y(c, d);
    cout << x + y << "\n";
    cout << x * y << "\n";
    return 0;
}
`, [["1 2 3 4", "4+6i\n-5+10i"], ["2 -3 1 1", "3-2i\n5-1i"]], [["0 0 5 7", "5+7i\n0+0i"], ["-1 -1 -1 -1", "-2-2i\n0+2i"]], { level: "intermediate", match: "exact", rules: [classNamed("Complex"), has(String.raw`\boperator\s*\+\s*\(`, "Overloads operator+"), has(String.raw`\boperator\s*\*\s*\(`, "Overloads operator*"), has(String.raw`\boperator\s*<<\s*\(`, "Overloads operator<< for printing")] }),

    cppq("Visitor counter with a static member", "Write a class Visitor whose constructor adds one to a static counter shared by all objects, and a static method total(). For every name read, create a Visitor and print its number.", ["Input: n, then n names", "Output per name: Welcome <name>, you are visitor <k>", "Last line: Total visitors: <n>"], String.raw`#include <iostream>
#include <string>
#include <vector>
using namespace std;

class Visitor {
private:
    string name;
    int number = 0;
    static int count;

public:
    explicit Visitor(const string& n) : name(n) {
        count++;
        number = count;
    }
    void greet() const { cout << "Welcome " << name << ", you are visitor " << number << "\n"; }
    static int total() { return count; }
};

int Visitor::count = 0;

int main() {
    int n;
    cin >> n;
    vector<Visitor> visitors;
    for (int i = 0; i < n; i++) {
        string name;
        cin >> name;
        visitors.emplace_back(name);
        visitors.back().greet();
    }
    cout << "Total visitors: " << Visitor::total() << "\n";
    return 0;
}
`, [["3\nAsha Ravi Meena", "Welcome Asha visitor 1 Welcome Ravi visitor 2 Welcome Meena visitor 3 Total visitors 3"]], [["1\nOm", "Welcome Om visitor 1 Total visitors 1"], ["0", "Total visitors 0"]], { rules: [classNamed("Visitor"), has(String.raw`\bstatic\s+int\s+\w+`, "Has a static int member"), has(String.raw`\bVisitor\s*::\s*total\s*\(`, "Calls the static method as Visitor::total()")] }),

    cppq("Fraction class", "Write a class Fraction that always stores itself in lowest terms with a positive denominator (use std::gcd from <numeric>), overloads + and *, and has a print method. Read two fractions and print their sum and product.", ["Input: four integers a b c d meaning a/b and c/d (b and d are not 0)", "Output line 1: the sum as p/q in lowest terms", "Output line 2: the product as p/q in lowest terms", "Zero is printed as 0/1"], String.raw`#include <iostream>
#include <numeric>
using namespace std;

class Fraction {
private:
    long long num = 0, den = 1;

    void reduce() {
        long long g = gcd(num, den);
        num /= g;
        den /= g;
        if (den < 0) {
            num = -num;
            den = -den;
        }
    }

public:
    Fraction(long long n, long long d) : num(n), den(d) { reduce(); }

    Fraction operator+(const Fraction& o) const { return Fraction(num * o.den + o.num * den, den * o.den); }
    Fraction operator*(const Fraction& o) const { return Fraction(num * o.num, den * o.den); }

    void print() const { cout << num << "/" << den << "\n"; }
};

int main() {
    long long a, b, c, d;
    cin >> a >> b >> c >> d;
    Fraction x(a, b), y(c, d);
    cout << "Sum: ";
    (x + y).print();
    cout << "Product: ";
    (x * y).print();
    return 0;
}
`, [["1 2 1 3", "5 6 1 6"], ["1 2 1 2", "1 1 1 4"]], [["1 2 -1 2", "0 1 -1 4"], ["3 -4 1 4", "-1 2 -3 16"], ["2 4 6 8", "5 4 3 8"]], { level: "intermediate", rules: [classNamed("Fraction"), has(String.raw`\bgcd\s*\(`, "Reduces with gcd"), has(String.raw`\boperator\s*\+\s*\(`, "Overloads operator+")] }),

    cppq("Person and Student inheritance", "Write a class Person (protected name and age, a method introduce()) and a class Student that inherits publicly from Person, adds a college and a roll number, and whose introduce() first calls Person::introduce() and then prints its own details.", ["Input: name, age, college (one word) and roll number", "Output line 1: Name: <name>, Age: <age>", "Output line 2: College: <college>, Roll: <roll>"], String.raw`#include <iostream>
#include <string>
using namespace std;

class Person {
protected:
    string name;
    int age = 0;

public:
    Person(const string& n, int a) : name(n), age(a) {}
    void introduce() const { cout << "Name: " << name << ", Age: " << age << "\n"; }
};

class Student : public Person {
private:
    string college;
    int roll = 0;

public:
    Student(const string& n, int a, const string& c, int r) : Person(n, a), college(c), roll(r) {}
    void introduce() const {
        Person::introduce();
        cout << "College: " << college << ", Roll: " << roll << "\n";
    }
};

int main() {
    string name, college;
    int age, roll;
    cin >> name >> age >> college >> roll;
    Student s(name, age, college, roll);
    s.introduce();
    return 0;
}
`, [["Asha 20 COEP 42", "Name Asha Age 20 College COEP Roll 42"]], [["Ravi 19 VJTI 7", "Name Ravi Age 19 College VJTI Roll 7"], ["Om 25 IITB 1001", "Name Om Age 25 College IITB Roll 1001"]], { rules: [has(String.raw`\bclass\s+Student\s*:\s*public\s+Person\b`, "Student inherits publicly from Person"), has(String.raw`\bprotected\s*:`, "Person's data is protected"), has(String.raw`\bPerson\s*::\s*introduce\s*\(`, "Calls Person::introduce()")] }),

    cppq("Shapes with polymorphism", "Write an abstract class Shape with a pure virtual area() and a virtual destructor, and classes Circle, Rectangle and Triangle that override it. Store the shapes in a vector<unique_ptr<Shape>> and print each area and the total. Use pi = 3.14159265358979.", ["Input: n, then n lines: C <radius>, R <length> <width> or T <base> <height>", "Output per shape: Circle, Rectangle or Triangle and its area (2 decimals)", "Last line: Total: <sum of areas> (2 decimals)"], String.raw`#include <iostream>
#include <iomanip>
#include <memory>
#include <string>
#include <vector>
using namespace std;

const double PI = 3.14159265358979;

class Shape {
public:
    virtual ~Shape() = default;
    virtual string name() const = 0;
    virtual double area() const = 0;
};

class Circle : public Shape {
    double r = 0;

public:
    explicit Circle(double radius) : r(radius) {}
    string name() const override { return "Circle"; }
    double area() const override { return PI * r * r; }
};

class Rectangle : public Shape {
    double l = 0, w = 0;

public:
    Rectangle(double length, double width) : l(length), w(width) {}
    string name() const override { return "Rectangle"; }
    double area() const override { return l * w; }
};

class Triangle : public Shape {
    double b = 0, h = 0;

public:
    Triangle(double base, double height) : b(base), h(height) {}
    string name() const override { return "Triangle"; }
    double area() const override { return 0.5 * b * h; }
};

int main() {
    int n;
    cin >> n;
    vector<unique_ptr<Shape>> shapes;
    for (int i = 0; i < n; i++) {
        char type;
        double x, y = 0;
        cin >> type >> x;
        if (type == 'C') {
            shapes.push_back(make_unique<Circle>(x));
        } else {
            cin >> y;
            if (type == 'R') shapes.push_back(make_unique<Rectangle>(x, y));
            else shapes.push_back(make_unique<Triangle>(x, y));
        }
    }
    double total = 0;
    cout << fixed << setprecision(2);
    for (const auto& s : shapes) {
        cout << s->name() << ": " << s->area() << "\n";
        total += s->area();
    }
    cout << "Total: " << total << "\n";
    return 0;
}
`, [["3\nC 2\nR 3 4\nT 3 4", "Circle 12.57 Rectangle 12.00 Triangle 6.00 Total 30.57"]], [["1\nC 1", "Circle 3.14 Total 3.14"], ["2\nT 5 5\nR 2.5 2", "Triangle 12.50 Rectangle 5.00 Total 17.50"]], { level: "advanced", rules: [has(String.raw`\bvirtual\s+double\s+area\s*\(\s*\)\s*const\s*=\s*0\s*;`, "Shape declares a pure virtual area() const = 0"), overrides, has(String.raw`unique_ptr\s*<\s*Shape\s*>`, "Stores the shapes as unique_ptr<Shape>"), has(String.raw`virtual\s+~\s*Shape`, "Shape has a virtual destructor")] }),

    cppq("Payroll with virtual functions", "Write a base class Employee (protected name, virtual role() and a pure virtual salary()) and three derived classes: Manager (base pay + bonus), Intern (fixed stipend) and HourlyWorker (hours x rate). Read the staff list, print each person's pay and the total payroll.", ["Input: n, then n lines: M <name> <base> <bonus>, I <name> <stipend> or H <name> <hours> <rate>", "Output per person: <name> (<Manager/Intern/Hourly>): <pay>", "Last line: Total payroll: <sum>"], String.raw`#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Employee {
protected:
    string name;

public:
    explicit Employee(const string& n) : name(n) {}
    virtual ~Employee() = default;
    const string& getName() const { return name; }
    virtual string role() const = 0;
    virtual long long salary() const = 0;
};

class Manager : public Employee {
    long long base = 0, bonus = 0;

public:
    Manager(const string& n, long long b, long long extra) : Employee(n), base(b), bonus(extra) {}
    string role() const override { return "Manager"; }
    long long salary() const override { return base + bonus; }
};

class Intern : public Employee {
    long long stipend = 0;

public:
    Intern(const string& n, long long s) : Employee(n), stipend(s) {}
    string role() const override { return "Intern"; }
    long long salary() const override { return stipend; }
};

class HourlyWorker : public Employee {
    long long hours = 0, rate = 0;

public:
    HourlyWorker(const string& n, long long h, long long r) : Employee(n), hours(h), rate(r) {}
    string role() const override { return "Hourly"; }
    long long salary() const override { return hours * rate; }
};

int main() {
    int n;
    cin >> n;
    vector<unique_ptr<Employee>> staff;
    for (int i = 0; i < n; i++) {
        char type;
        string name;
        long long a, b = 0;
        cin >> type >> name >> a;
        if (type == 'I') {
            staff.push_back(make_unique<Intern>(name, a));
        } else {
            cin >> b;
            if (type == 'M') staff.push_back(make_unique<Manager>(name, a, b));
            else staff.push_back(make_unique<HourlyWorker>(name, a, b));
        }
    }
    long long total = 0;
    for (const auto& e : staff) {
        cout << e->getName() << " (" << e->role() << "): " << e->salary() << "\n";
        total += e->salary();
    }
    cout << "Total payroll: " << total << "\n";
    return 0;
}
`, [["3\nM Asha 50000 10000\nI Ravi 15000\nH Meena 160 250", "Asha Manager 60000 Ravi Intern 15000 Meena Hourly 40000 Total payroll 115000"]], [["1\nI Om 0", "Om Intern 0 Total payroll 0"], ["2\nH A 10 100\nM B 1 1", "A Hourly 1000 B Manager 2 Total payroll 1002"]], { level: "advanced", rules: [has(String.raw`\bclass\s+Manager\s*:\s*public\s+Employee\b`, "Manager inherits from Employee"), has(String.raw`\bvirtual\s+long\s+long\s+salary\s*\(\s*\)\s*const\s*=\s*0`, "salary() is pure virtual in Employee"), overrides, virtualFn] }),

    cppq("Constructor and destructor order", "Write a class Base and a class Derived : public Base. Each constructor and destructor prints a line with the name it was given. In main, create a Derived inside its own block { } and let it go out of scope, then print Done.", ["Input: one word, the object's name", "Output: Base constructor <name>, Derived constructor <name>, Derived destructor <name>, Base destructor <name>, Done (one per line)", "Give Base a virtual destructor"], String.raw`#include <iostream>
#include <string>
using namespace std;

class Base {
protected:
    string name;

public:
    explicit Base(const string& n) : name(n) { cout << "Base constructor " << name << "\n"; }
    virtual ~Base() { cout << "Base destructor " << name << "\n"; }
};

class Derived : public Base {
public:
    explicit Derived(const string& n) : Base(n) { cout << "Derived constructor " << name << "\n"; }
    ~Derived() override { cout << "Derived destructor " << name << "\n"; }
};

int main() {
    string name;
    cin >> name;
    {
        Derived d(name);
    }
    cout << "Done\n";
    return 0;
}
`, [["box", "Base constructor box Derived constructor box Derived destructor box Base destructor box Done"]], [["x", "Base constructor x Derived constructor x Derived destructor x Base destructor x Done"], ["Inveon", "Base constructor inveon Derived constructor inveon Derived destructor inveon Base destructor inveon Done"]], { level: "advanced", rules: [has(String.raw`\bclass\s+Derived\s*:\s*public\s+Base\b`, "Derived inherits publicly from Base"), has(String.raw`virtual\s+~\s*Base\s*\(`, "Base has a virtual destructor"), has(String.raw`~\s*Derived\s*\(`, "Derived has a destructor")] }),
  ],
  quiz: [
    { q: "In a class, what is the default access of members declared before any public: or private: label?", options: ["public", "private", "protected", "It depends on the compiler"], answer: 1, why: "class members are private by default; struct members are public by default." },
    { q: "What is special about a constructor?", options: ["It returns an int", "It has the class's name, no return type, and runs when an object is created", "It must be called by hand", "It can only take no parameters"], answer: 1, why: "Constructors initialise new objects automatically and have no return type." },
    { q: "What does const after a method's parameter list mean, as in double area() const?", options: ["The method returns a constant", "The method does not change the object", "The method can't be overridden", "The method is static"], answer: 1, why: "A const method may not modify data members, so it can be called on const objects." },
    { q: "How many copies of a static data member exist?", options: ["One per object", "One shared by the whole class", "None until a static method is called", "Two"], answer: 1, why: "A static member belongs to the class, not to individual objects." },
    { q: "In class Student : public Person, which constructor runs first when a Student is created?", options: ["Student's", "Person's", "They run at the same time", "Whichever is declared first in the file"], answer: 1, why: "The base part is constructed before the derived part; destruction happens in reverse." },
    { q: "Which access level lets derived classes use a member but hides it from other code?", options: ["public", "private", "protected", "friend"], answer: 2, why: "protected members are accessible in the class and its derived classes." },
    { q: "What makes a class abstract in C++?", options: ["The keyword abstract", "At least one pure virtual function (= 0)", "Having no constructor", "Only private members"], answer: 1, why: "A pure virtual function makes the class abstract, so it can't be instantiated." },
    { q: "Shape has a non-virtual area(), and Circle defines its own area(). What does this call?\n\nShape* s = new Circle(2);\ns->area();", options: ["Circle::area", "Shape::area", "A compile error", "Both, one after the other"], answer: 1, why: "Without virtual, the call is decided by the pointer's static type (Shape)." },
    { q: "Why should a base class used polymorphically have a virtual destructor?", options: ["To make the class abstract", "So that deleting a derived object through a base pointer also runs the derived destructor", "Destructors must always be virtual", "To allow copying"], answer: 1, why: "With a non-virtual destructor, delete on a Base* only runs ~Base, which is undefined behaviour for derived objects." },
    { q: "What goes wrong with vector<Shape> shapes; shapes.push_back(Circle(2)); when Shape is a concrete base class?", options: ["Nothing", "The Circle is sliced: only the Shape part is copied, so virtual calls run Shape's versions", "It runs Circle::area correctly", "vector can't hold classes"], answer: 1, why: "Storing by value copies only the base part (object slicing); store pointers such as unique_ptr<Shape> instead." },
  ],
};
